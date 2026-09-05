(function () {
  const translations = window.SPLATONE_I18N || {};
  const supportedLangs = Object.keys(translations);
  const defaultLang = supportedLangs.includes('en') ? 'en' : supportedLangs[0];
  const pageName = document.body.dataset.page || 'home';

  function getLanguage() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('lang') || localStorage.getItem('splatone-lang') || defaultLang;
    return translations[requested] ? requested : defaultLang;
  }

  function setLanguage(lang) {
    if (!translations[lang]) return;
    localStorage.setItem('splatone-lang', lang);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.location.href = url.toString();
  }

  const lang = getLanguage();
  const t = translations[lang];
  document.documentElement.lang = lang;

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function rawHtml(html) {
    const span = document.createElement('span');
    span.innerHTML = html;
    return span;
  }

  function codeBlock(code) {
    const pre = create('pre', 'code-block');
    const codeEl = create('code', '', code);
    pre.append(codeEl);
    return pre;
  }

  function buttonLink(href, label, variant) {
    const a = create('a', `button ${variant || ''}`.trim(), label);
    a.href = href;
    return a;
  }

  function sectionShell(kicker, title, intro) {
    const section = create('section', 'section');
    if (kicker) section.append(create('p', 'kicker', kicker));
    section.append(create('h1', 'page-title', title));
    if (intro) section.append(create('p', 'page-intro', intro));
    return section;
  }

  function renderChrome(mainContent) {
    const root = document.getElementById('site-root');
    const shell = create('div', 'site-shell');
    shell.append(renderHeader());

    const main = create('main', '', null);
    main.id = 'main';
    main.append(mainContent);
    shell.append(main);
    shell.append(renderFooter());
    root.replaceChildren(shell);
  }

  function renderHeader() {
    const header = create('header', 'site-header');
    const inner = create('div', 'header-inner');

    const brand = create('a', 'brand', null);
    brand.href = 'index.html';
    brand.setAttribute('aria-label', 'Splatone home');
    brand.append(create('span', 'brand-mark', 'S'));
    const brandText = create('span', 'brand-text');
    brandText.append(create('strong', '', t.siteTitle));
    brandText.append(create('small', '', t.tagline));
    brand.append(brandText);

    const nav = create('nav', 'nav');
    nav.setAttribute('aria-label', 'Primary navigation');
    t.nav.forEach((item) => {
      const link = create('a', item.page === pageName ? 'active' : '', item.label);
      link.href = withLang(item.href);
      nav.append(link);
    });

    const tools = create('div', 'header-tools');
    const select = create('select', 'language-select');
    select.setAttribute('aria-label', 'Language');
    supportedLangs.forEach((code) => {
      const option = create('option', '', translations[code].languageName || code);
      option.value = code;
      option.selected = code === lang;
      select.append(option);
    });
    select.addEventListener('change', (event) => setLanguage(event.target.value));
    tools.append(select);
    tools.append(buttonLink(t.repoUrl, t.common.github, 'button-ghost'));

    inner.append(brand, nav, tools);
    header.append(inner);
    return header;
  }

  function withLang(href) {
    if (lang === defaultLang) return href;
    return `${href}?lang=${encodeURIComponent(lang)}`;
  }

  function renderFooter() {
    const footer = create('footer', 'site-footer');
    const inner = create('div', 'footer-inner');
    inner.append(create('p', '', t.footer.text));
    const links = create('div', 'footer-links');
    links.append(buttonLink(t.repoUrl, t.footer.source, 'button-ghost'));
    links.append(buttonLink(t.japaneseReadmeUrl || '../README.ja.md', t.common.japaneseReadme, 'button-ghost'));
    inner.append(links);
    footer.append(inner);
    return footer;
  }

  function renderHome() {
    const page = t.home;
    const wrap = create('div', 'home-page');

    const hero = create('section', 'hero');
    const heroText = create('div', 'hero-copy');
    heroText.append(create('p', 'kicker', page.eyebrow));
    heroText.append(create('h1', '', page.title));
    heroText.append(create('p', 'hero-intro', page.intro));
    heroText.append(create('p', 'homage', page.homage));
    const ctas = create('div', 'cta-row');
    ctas.append(buttonLink(withLang('commands.html'), page.primaryCta, 'button-primary'));
    ctas.append(buttonLink(withLang('examples.html'), page.secondaryCta, 'button-secondary'));
    heroText.append(ctas);

    const heroVisual = create('figure', 'hero-visual');
    const img = create('img');
    img.src = page.heroImage;
    img.alt = page.heroAlt;
    img.loading = 'eager';
    heroVisual.append(img);
    heroVisual.append(create('figcaption', '', 'Category colors become map layers, clusters, and spatial summaries.'));
    hero.append(heroText, heroVisual);

    const stats = create('section', 'stats-grid');
    page.stats.forEach((item) => {
      const card = create('article', 'stat-card');
      card.append(create('strong', '', item.value));
      card.append(create('span', '', item.label));
      stats.append(card);
    });

    const cards = create('section', 'feature-grid section');
    page.sections.forEach((item) => {
      const card = create('article', 'feature-card ink-card');
      card.append(create('h2', '', item.title));
      card.append(create('p', '', item.body));
      cards.append(card);
    });

    const quick = create('section', 'section command-band');
    quick.append(create('h2', '', page.quickStartTitle));
    quick.append(create('p', '', page.quickStartText));
    quick.append(codeBlock(page.command));

    const gallery = create('section', 'section');
    gallery.append(create('h2', '', page.galleryTitle));
    const galleryGrid = create('div', 'gallery-grid');
    page.gallery.forEach((item) => {
      const fig = create('figure', 'gallery-card');
      const pic = create('img');
      pic.src = item.image;
      pic.alt = item.alt;
      pic.loading = 'lazy';
      fig.append(pic, create('figcaption', '', item.title));
      galleryGrid.append(fig);
    });
    gallery.append(galleryGrid);

    wrap.append(hero, stats, cards, quick, gallery);
    return wrap;
  }

  function renderCommands() {
    const page = t.commands;
    const wrap = sectionShell(null, page.title, page.intro);

    const commandGrid = create('div', 'command-grid');
    page.sections.forEach((item) => {
      const card = create('article', 'ink-card');
      card.append(create('h2', '', item.title));
      card.append(create('p', '', item.body));
      card.append(codeBlock(item.code));
      commandGrid.append(card);
    });
    wrap.append(commandGrid);

    wrap.append(renderTableSection(page.coreOptionsTitle, ['Option', 'Description'], page.coreOptions));
    wrap.append(renderTableSection(page.keywordTitle, ['Pattern', 'Example'], page.keywordRows));

    const api = create('section', 'section');
    api.append(create('h2', '', page.apiTitle));
    api.append(create('p', '', page.apiText));
    wrap.append(api);
    return wrap;
  }

  function renderExamples() {
    const page = t.examples;
    const wrap = sectionShell(null, page.title, page.intro);
    const grid = create('div', 'example-grid');
    page.cards.forEach((item) => {
      const card = create('article', 'example-card');
      const image = create('img');
      image.src = item.image;
      image.alt = `${item.title} screenshot`;
      image.loading = 'lazy';
      const body = create('div', 'example-body');
      body.append(create('h2', '', item.title));
      body.append(create('p', '', item.body));
      const actions = create('div', 'cta-row compact');
      actions.append(buttonLink(item.json, page.browsePrefix, 'button-secondary'));
      body.append(actions);
      body.append(codeBlock(item.code));
      card.append(image, body);
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function renderArchitecture() {
    const page = t.architecture;
    const wrap = sectionShell(null, page.title, page.intro);
    const pipeline = create('section', 'pipeline');
    page.pipeline.forEach((step, index) => {
      const item = create('article', 'pipeline-step');
      item.append(create('span', 'step-number', String(index + 1).padStart(2, '0')));
      const body = create('div');
      body.append(create('h2', '', step[0]));
      body.append(create('p', '', step[1]));
      item.append(body);
      pipeline.append(item);
    });
    wrap.append(pipeline);

    const grid = create('section', 'feature-grid section');
    [
      [page.pluginTitle, page.pluginText],
      [page.dataTitle, page.dataText]
    ].forEach(([title, body]) => {
      const card = create('article', 'ink-card');
      card.append(create('h2', '', title));
      card.append(create('p', '', body));
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function renderProviders() {
    const page = t.providers;
    const wrap = sectionShell(null, page.title, page.intro);
    const grid = create('div', 'doc-card-stack');
    page.cards.forEach((item) => {
      const card = create('article', 'doc-card');
      card.append(create('p', 'kicker', item.id));
      card.append(create('h2', '', item.title));
      card.append(create('p', 'lead', item.summary));
      const list = create('ol', 'algorithm-list');
      item.steps.forEach((step) => list.append(create('li', '', step)));
      card.append(list);
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function renderVisualizers() {
    const page = t.visualizers;
    const wrap = sectionShell(null, page.title, page.intro);
    const grid = create('div', 'visualizer-grid');
    page.cards.forEach((item) => {
      const card = create('article', 'doc-card compact-card');
      card.append(create('h2', '', item.title));
      card.append(create('p', 'lead', item.summary));
      card.append(create('p', '', item.body));
      grid.append(card);
    });
    wrap.append(grid);
    return wrap;
  }

  function renderTableSection(title, headers, rows) {
    const section = create('section', 'section table-section');
    section.append(create('h2', '', title));
    const tableWrap = create('div', 'table-wrap');
    const table = create('table');
    const thead = create('thead');
    const tr = create('tr');
    headers.forEach((head) => tr.append(create('th', '', head)));
    thead.append(tr);
    const tbody = create('tbody');
    rows.forEach((row) => {
      const bodyRow = create('tr');
      row.forEach((cell) => {
        const td = create('td');
        td.append(rawHtml(cell));
        bodyRow.append(td);
      });
      tbody.append(bodyRow);
    });
    table.append(thead, tbody);
    tableWrap.append(table);
    section.append(tableWrap);
    return section;
  }

  const renderers = {
    home: renderHome,
    commands: renderCommands,
    examples: renderExamples,
    architecture: renderArchitecture,
    providers: renderProviders,
    visualizers: renderVisualizers
  };

  renderChrome((renderers[pageName] || renderHome)());
})();
