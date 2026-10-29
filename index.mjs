// AWS Lambda (Node.js 20) - GitHub proxy for the portfolio.
// Keeps the GitHub token server-side, caches results for 10 minutes,
// and returns real contribution counts via the GraphQL API.
const USER = process.env.GITHUB_USER || "kavix";
const TOKEN = process.env.GITHUB_TOKEN || "";
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, body: "" }; // survives warm invocations

const gh = (path, init = {}) =>
  fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "portfolio-proxy",
      ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return r.json();
  });

const CAL = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;

async function build() {
  const [cal, prs, repos] = await Promise.all([
    TOKEN
      ? gh("/graphql", { method: "POST", body: JSON.stringify({ query: CAL, variables: { login: USER } }) })
          .then((j) => j.data.user.contributionsCollection.contributionCalendar)
          .catch(() => null)
      : null,
    gh(`/search/issues?q=author:${USER}+is:pr&sort=created&order=desc&per_page=100`),
    gh(`/users/${USER}/repos?sort=pushed&per_page=100`),
  ]);
  return {
    user: USER,
    generatedAt: new Date().toISOString(),
    calendar: cal && cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ d: d.date, c: d.contributionCount }))),
    prs: prs.items.map((i) => ({
      created_at: i.created_at, title: i.title, url: i.html_url, num: i.number,
      repo: i.repository_url.split("/repos/")[1],
      st: i.pull_request?.merged_at ? "merged" : i.state === "open" ? "open" : "closed",
    })),
    repos: repos.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 30)
      .map((r) => ({ name: r.name, desc: r.description, stars: r.stargazers_count, forks: r.forks_count, lang: r.language, url: r.html_url })),
  };
}

export const handler = async () => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" };
  if (cache.body && Date.now() - cache.at < TTL_MS) return { statusCode: 200, headers, body: cache.body };
  try {
    cache = { at: Date.now(), body: JSON.stringify(await build()) };
    return { statusCode: 200, headers, body: cache.body };
  } catch (e) {
    console.error(e);
    if (cache.body) return { statusCode: 200, headers, body: cache.body }; // serve stale data
    return { statusCode: 502, headers, body: JSON.stringify({ error: "github_unavailable" }) };
  }
};
