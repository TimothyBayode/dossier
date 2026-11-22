/**
 * Teamwork Graph adapter.
 *
 * Jira knows what a ticket says. The graph knows what is attached to it that
 * Jira cannot show: the pull request waiting to merge, the goal the team is
 * tracking. That is the difference between a dossier that restates the ticket
 * and one that tells an agent what is actually in flight.
 *
 * Everything here is best-effort and bounded. A missing scope comes back as an
 * empty result rather than an error (the docs are explicit about that), so a
 * graph failure must thin the dossier, never break it. `unavailable` counts
 * failures so the caller can say the context is partial instead of implying
 * nothing is linked.
 */

import forgeApi from '@forge/api';

const { asUser } = forgeApi;

// Exported so a test can pin the exact fields we ask for: a field that does not
// exist on the object type is a GraphQL error, which would otherwise show up as
// a quietly thinner dossier.
export const PULL_REQUESTS = `
  query Dossier_pullRequests($id: ID!) {
    jiraWorkItemLinkedExternalPullRequests(id: $id, first: 25) {
      edges {
        node {
          ... on ExternalPullRequest {
            id
            title
            status
            url
          }
        }
      }
    }
  }
`;

export const GOALS = `
  query Dossier_goals($id: ID!) {
    jiraWorkItemGoals(id: $id, first: 25) {
      edges {
        node {
          ... on AtlassianGoal {
            id
            name
          }
        }
      }
    }
  }
`;

/** The graph identifies a work item by ARI, not by issue key. */
export function workItemAri(cloudId, issueId) {
  if (!cloudId || !issueId) return null;
  return `ari:cloud:jira:${cloudId}:issue/${issueId}`;
}

export function enabled() {
  return String(process.env.DOSSIER_TWG || 'on').toLowerCase() !== 'off';
}

async function query(gql, variables) {
  const res = await asUser().requestTeamworkGraph(gql, variables);
  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join('; ').slice(0, 200));
  }
  return json?.data || {};
}

function edges(data, field) {
  return (data?.[field]?.edges || []).map((edge) => edge?.node).filter(Boolean);
}

export async function forIssue(ari) {
  if (!enabled() || !ari) return { pulls: [], goals: [], unavailable: ari ? 0 : 1 };

  let unavailable = 0;
  const [pulls, goals] = await Promise.all([
    query(PULL_REQUESTS, { id: ari })
      .then((data) =>
        edges(data, 'jiraWorkItemLinkedExternalPullRequests')
          .filter((pr) => !/merged|closed|declined/i.test(String(pr.status || '')))
          .map((pr) => ({
            id: String(pr.id),
            title: pr.title || 'A pull request',
            state: String(pr.status || 'OPEN'),
            url: pr.url || null,
          })),
      )
      .catch((error) => {
        unavailable += 1;
        console.error(`[dossier] graph pull-request lookup failed: ${error.message}`);
        return [];
      }),
    query(GOALS, { id: ari })
      .then((data) => edges(data, 'jiraWorkItemGoals').map((goal) => ({ id: String(goal.id), title: goal.name || 'A goal' })))
      .catch((error) => {
        unavailable += 1;
        console.error(`[dossier] graph goal lookup failed: ${error.message}`);
        return [];
      }),
  ]);

  return { pulls, goals, unavailable };
}
