<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Viral Radar</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel-alt: #1f2937;
        --card: #0b1220;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --accent: #38bdf8;
        --success: #34d399;
        --warning: #fbbf24;
        --danger: #f87171;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: var(--bg);
        color: var(--text);
      }

      .container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 32px 20px 60px;
      }

      h1 {
        margin-bottom: 8px;
        font-size: 2.3rem;
      }

      .subtitle {
        color: var(--muted);
        margin-bottom: 24px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }

      .stat-card {
        background: var(--panel);
        border: 1px solid #243244;
        border-radius: 12px;
        padding: 16px;
      }

      .stat-label {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: bold;
        margin-top: 8px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 18px;
      }

      .card {
        background: var(--panel);
        border: 1px solid #243244;
        border-radius: 14px;
        padding: 18px;
      }

      .story-title {
        margin-top: 0;
        font-size: 1.1rem;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0;
      }

      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 6px 10px;
        background: var(--panel-alt);
        color: var(--text);
        font-size: 0.8rem;
      }

      .phase {
        background: rgba(56, 189, 248, 0.14);
        color: var(--accent);
      }

      .summary {
        color: var(--muted);
        line-height: 1.5;
      }

      .loading {
        color: var(--muted);
        margin-top: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Viral Radar</h1>
      <div class="subtitle">Cross-border stories in motion</div>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-label">Trending stories</div>
          <div id="story-count" class="stat-value">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Top countries</div>
          <div id="country-count" class="stat-value">0</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Status</div>
          <div id="status" class="stat-value">Live</div>
        </div>
      </div>

      <div class="grid" id="stories"></div>
    </div>

    <script>
      async function loadStories() {
        const response = await fetch('/api/trending');
        const stories = await response.json();
        const container = document.getElementById('stories');
        document.getElementById('story-count').textContent = String(stories.length);

        const maxCountries = stories.reduce((max, story) => Math.max(max, story.countryCount || 0), 0);
        document.getElementById('country-count').textContent = String(maxCountries);

        if (!stories.length) {
          container.innerHTML = '<div class="card"><p class="loading">No stories available yet.</p></div>';
          return;
        }

        container.innerHTML = stories.map((story) => `
          <article class="card">
            <h2 class="story-title">${story.title}</h2>
            <div class="meta">
              <span class="pill phase">${story.phase}</span>
              <span class="pill">${story.countryCount} countries</span>
              <span class="pill">score ${story.score}</span>
              <span class="pill">${story.source}</span>
            </div>
            <p class="summary">${story.summary}</p>
          </article>
        `).join('');
      }

      loadStories();
    </script>
  </body>
</html>
