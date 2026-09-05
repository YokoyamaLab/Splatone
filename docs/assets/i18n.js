(function () {
  const RAW = 'https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main';

  window.SPLATONE_I18N = {
    en: {
      languageName: 'English',
      siteTitle: 'Splatone',
      tagline: 'Color-coded geospatial data collection and visualization',
      repoUrl: 'https://github.com/YokoyamaLab/Splatone',
      japaneseReadmeUrl: 'https://github.com/YokoyamaLab/Splatone/blob/main/README.ja.md',
      nav: [
        { href: 'index.html', page: 'home', label: 'Home' },
        { href: 'commands.html', page: 'commands', label: 'Commands' },
        { href: 'examples.html', page: 'examples', label: 'Examples' },
        { href: 'architecture.html', page: 'architecture', label: 'Architecture' },
        { href: 'providers.html', page: 'providers', label: 'Providers' },
        { href: 'visualizers.html', page: 'visualizers', label: 'Visualizers' }
      ],
      common: {
        github: 'GitHub',
        install: 'Run with npx',
        japaneseReadme: 'Japanese README',
        docsNote: 'Language-ready static documentation. Add another locale object to extend this site beyond English.',
        copy: 'Copy',
        copied: 'Copied'
      },
      home: {
        eyebrow: 'Open-source geospatial visualization for category-aware maps',
        title: 'Paint maps with data, then compare what each color means.',
        intro: 'Splatone collects geotagged photos and points of interest from multiple sources, normalizes them into a shared GeoJSON-based model, and renders them with interchangeable visualization plugins.',
        homage: 'The name is an homage to the idea of Splatoon-like color splashes: each category leaves its own vivid trace on the map.',
        primaryCta: 'View command reference',
        secondaryCta: 'Explore examples',
        heroImage: `${RAW}/assets/screenshop_pizza_piazza.png`,
        heroAlt: 'Splatone map example comparing pizza and piazza in Napoli',
        stats: [
          { value: '3', label: 'Provider plugins' },
          { value: '7', label: 'Visualizer plugins' },
          { value: 'GeoJSON', label: 'Shared output model' },
          { value: 'MIT', label: 'License' }
        ],
        sections: [
          {
            title: 'Independent Provider plugins',
            body: 'Flickr, Google Places, and OpenStreetMap/Overpass are loaded as independent data-source plugins. Each provider turns its own service response into comparable geospatial features.'
          },
          {
            title: 'Independent Visualizer plugins',
            body: 'Point maps, marker clusters, heatmaps, hex summaries, pie charts, Voronoi cells, and DBSCAN boundaries are separate visualizer plugins that can be combined from the command line.'
          },
          {
            title: 'Interactive workflow',
            body: 'Draw a target area, let Splatone divide it into hexagonal work units, crawl each category, inspect the results, and export reusable visualization data.'
          }
        ],
        quickStartTitle: 'Quick start',
        quickStartText: 'Install Node.js, then run Splatone directly with npx.',
        command: 'npx -y -p splatone@latest crawler -p flickr -k "canal,river,sea|street,alley|bridge" --vis-bulky --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
        galleryTitle: 'Visual forms for the same data',
        gallery: [
          { title: 'Bulky points', image: `${RAW}/examples/tower-bulky.png`, alt: 'Bulky point visualization' },
          { title: 'Heatmap', image: `${RAW}/examples/tower-heat.png`, alt: 'Heatmap visualization' },
          { title: 'Voronoi', image: `${RAW}/examples/tower-voronoi.png`, alt: 'Voronoi visualization' }
        ]
      },
      commands: {
        title: 'Command Reference',
        intro: 'Splatone exposes three CLI entry points: crawl data, browse existing results, and generate palettes.',
        sections: [
          {
            title: 'Crawler',
            body: 'Start a crawl with one provider, one or more visualizers, and a keyword expression.',
            code: 'npx -y -p splatone@latest crawler -p flickr -k "Water=canal,river|Bridge=bridge" --vis-bulky --city "Venezia" --p-flickr-APIKEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
          },
          {
            title: 'Browse mode',
            body: 'Load previously exported result files without contacting provider APIs again.',
            code: 'npx -y -p splatone@latest browse --browse-load-url="https://raw.githubusercontent.com/YokoyamaLab/Splatone/refs/heads/main/examples/tower-bulky.json"'
          },
          {
            title: 'Palette utility',
            body: 'Generate color palettes and preview them in the browser.',
            code: 'npx -y -p splatone@latest color 6 3'
          }
        ],
        coreOptionsTitle: 'Core options',
        coreOptions: [
          ['`-p`, `--provider`', 'Selects the provider plugin, such as `flickr`, `gmap`, or `overpass`.'],
          ['`-k`, `--keywords`', 'Defines categories and query terms. Use `|` between categories and `,` between synonyms or query variants.'],
          ['`--vis-*`', 'Enables visualizer plugins, for example `--vis-bulky` or `--vis-heat`. Multiple visualizers can be enabled together.'],
          ['`--city`', 'Sets the initial map view by city name through geocoding.'],
          ['`--ui-bbox`', 'Sets the target bounding box as `minLon,minLat,maxLon,maxLat`.'],
          ['`--ui-cell-size`', 'Sets the size of generated hexagonal cells.'],
          ['`--ui-units`', 'Sets the distance unit for the UI grid, such as `meters`, `kilometers`, or `miles`.'],
          ['`--browse-mode`', 'Starts the application as a result viewer instead of a crawler.'],
          ['`--browse-load-url`', 'Loads a result JSON bundle from an HTTP or HTTPS URL in browse mode.']
        ],
        keywordTitle: 'Keyword grammar',
        keywordRows: [
          ['Compare categories', '`-k "sea|mountain"`'],
          ['Group synonyms', '`-k "sea,ocean|mountain,mount"`'],
          ['Name categories', '`-k "Water=sea,ocean|Mountain=mountain,mount"`'],
          ['Assign colors', '`-k "Water#037dfc=sea,ocean|Mountain#7fc266=mountain,mount"`'],
          ['Provider-specific query variants', '`-k "Cafe=amenity=cafe,amenity=coffee_shop"` for Overpass']
        ],
        apiTitle: 'API key resolution',
        apiText: 'Provider keys can be passed as command-line options, environment variables, or local `.API_KEY.<provider>` files. Do not share raw API keys in reproducible command examples.'
      },
      examples: {
        title: 'Examples',
        intro: 'These pre-generated examples compare Tokyo Tower and Tokyo Skytree with the same bounding box and cell size. Each card includes a screenshot and a result JSON that can be loaded in browse mode.',
        browsePrefix: 'Load result',
        cards: [
          ['Bulky', 'tower-bulky', 'Plots every collected point.'],
          ['Marker Cluster', 'tower-cluster', 'Groups dense points into zoom-aware clusters.'],
          ['Voronoi', 'tower-voronoi', 'Builds clipped Voronoi cells from sampled points.'],
          ['Pie Charts', 'tower-pie', 'Places category-ratio charts at hex-cell centers.'],
          ['Majority Hex', 'tower-hex', 'Colors each hex by its dominant category.'],
          ['Majority Hex, hexapartite', 'tower-hexapartite', 'Splits cells into six category-colored wedges.'],
          ['Heatmap', 'tower-heat', 'Renders continuous point-density intensity.'],
          ['DBSCAN', 'tower-dbscan', 'Extracts cluster boundaries as KDE contour polygons.']
        ].map(([title, slug, body]) => ({
          title,
          body,
          image: `${RAW}/examples/${slug}.png`,
          json: `${RAW}/examples/${slug}.json`,
          code: `npx -y -p splatone@latest browse --browse-load-url="${RAW}/examples/${slug}.json"`
        }))
      },
      architecture: {
        title: 'Architecture',
        intro: 'Splatone separates acquisition, normalization, visualization, and browsing so that new data sources and new analytical views can evolve independently.',
        pipeline: [
          ['CLI', 'Parse provider, visualizer, keyword, grid, and browse options.'],
          ['Map UI', 'A Leaflet interface lets users draw a rectangle or polygon and inspect the generated grid.'],
          ['Hex grid', 'Turf.js builds hexagonal cells from the selected area. Each hex stores an ID and references to six internal triangles.'],
          ['Provider jobs', 'For each hex and category, the selected Provider plugin schedules worker jobs with throttling and API-specific options.'],
          ['Normalized features', 'Workers return point FeatureCollections with `splatone_provider`, `splatone_hexId`, `splatone_triId`, category metadata, tooltips, and source IDs.'],
          ['Visualizer jobs', 'Each Visualizer plugin transforms the shared result object into one or more GeoJSON FeatureCollections.'],
          ['Browser rendering', 'Web visualizer modules render the exported FeatureCollections in Leaflet and preserve interactivity.'],
          ['Export', 'The final bundle can be downloaded and reopened later in browse mode.']
        ],
        pluginTitle: 'Plugin boundaries',
        pluginText: 'Providers extend `ProviderBase` and are discovered from the `providers/` directory. Visualizers extend `VisualizerBase` and are discovered from the `visualizer/` directory. Both plugin families define their own CLI options, option schemas, and runtime behavior while sharing the same host pipeline.',
        dataTitle: 'Data model',
        dataText: 'Internally, Splatone keeps crawl results as a nested structure keyed by hex ID and category. Visualizers receive that structure together with target geometry, triangle geometry, category definitions, and palette entries, then return GeoJSON layers for the browser.'
      },
      providers: {
        title: 'Provider Crawling Algorithms',
        intro: 'Providers are independent acquisition plugins. They schedule work per hex cell and per category, normalize source-specific records, and return comparable point features.',
        cards: [
          {
            title: 'Flickr Provider',
            id: 'flickr',
            summary: 'Collects geotagged Flickr photos within each hex-cell bounding box.',
            steps: [
              'For every selected hex and category, build a Flickr `photos.search` request with bbox, tags, geo filtering, extras, and upload/taken date bounds.',
              'Filter returned photos with point-in-polygon checks so only points inside the actual hex survive.',
              'Attach source metadata, tooltip preview HTML, the parent hex ID, and the containing triangle ID.',
              'If the result is too large, continue with a smaller date window. In haste mode, split crowded time windows into parallel subranges.',
              'Throttle API calls and optionally download the highest available requested image size with stable metadata-rich file names.'
            ]
          },
          {
            title: 'Google Places Text Search Provider',
            id: 'gmap',
            summary: 'Collects POIs from Google Places Text Search for each hex and query variant.',
            steps: [
              'Derive a search radius from the UI grid cell size and clamp it to the Google Places 50 km limit.',
              'Use the hex bbox as a `locationbias=rectangle` constraint and the hex centroid as the request location.',
              'Treat comma-separated category terms as query variants and request up to three Text Search pages.',
              'Wait before requesting follow-up pages because Google page tokens are not immediately ready.',
              'Normalize each place into a point feature with place ID, address, rating metadata, category, hex ID, triangle ID, tooltip text, and Google Maps URL.'
            ]
          },
          {
            title: 'OpenStreetMap / Overpass Provider',
            id: 'overpass',
            summary: 'Collects OSM nodes, ways, and relations matching tag expressions inside each hex bbox.',
            steps: [
              'Parse query specifications such as `amenity=cafe`, `tourism=museum`, or type-restricted forms like `node:amenity=cafe`.',
              'Build an Overpass QL query for the hex bounding box and request `out center tags` so ways and relations can be represented by coordinates.',
              'Retry transient failures such as timeouts and 429/502/503/504 responses with exponential backoff.',
              'Resolve coordinates from node lon/lat, element centers, or geometry fallback points.',
              'Filter points against the actual hex polygon and normalize each OSM object into a source-linked point feature.'
            ]
          }
        ]
      },
      visualizers: {
        title: 'Visualizer Algorithms',
        intro: 'Visualizers are independent rendering plugins. Each one receives the same normalized crawl result and returns the GeoJSON layers needed by its browser-side renderer.',
        cards: [
          {
            title: 'Bulky',
            summary: 'Direct point rendering.',
            body: 'Bulky iterates through every hex and category, preserves each point feature, and assigns Leaflet marker style properties from the category palette and visualizer options.'
          },
          {
            title: 'Marker Cluster',
            summary: 'Zoom-aware point aggregation.',
            body: 'Marker Cluster keeps point features grouped by category and annotates each point with its category. Browser-side rendering delegates spatial grouping to Leaflet marker clustering with the configured cluster radius.'
          },
          {
            title: 'Heat',
            summary: 'Density-weighted heatmap.',
            body: 'Heat collects point features per category, converts the configured radius to kilometers, counts neighboring points within that radius using haversine distance, and filters isolated points below the weight threshold before rendering heat layers.'
          },
          {
            title: 'Majority Hex',
            summary: 'Dominant-category hexagonal aggregation.',
            body: 'Majority Hex counts category features in each hex, selects the most frequent category for fill color, and normalizes opacity by total count. Hexapartite mode assigns six triangular wedges to category counts using proportional rounding.'
          },
          {
            title: 'Pie Charts',
            summary: 'Cell-centered category composition.',
            body: 'Pie Charts computes each hex centroid, builds a per-hex category breakdown, stores the hex boundary ring, and records global totals so browser-side charts can scale slice radius and angle consistently.'
          },
          {
            title: 'Voronoi',
            summary: 'Clipped local Voronoi partitions.',
            body: 'Voronoi aggregates points per hex, optionally enforces minimum site spacing using local same-category density priority, optionally downsamples sites, computes Turf Voronoi cells within each hex bbox, and clips cells to the parent hex polygon.'
          },
          {
            title: 'DBSCAN',
            summary: 'Cluster contours from density estimation.',
            body: 'DBSCAN clusters category points with Turf DBSCAN, groups non-noise clusters, estimates a kernel density grid inside each cluster, extracts smoothed d3-contour polygons, and falls back to convex hulls or buffers when contours are unavailable.'
          }
        ]
      },
      footer: {
        text: 'Splatone is released under the MIT License.',
        source: 'Source code on GitHub'
      }
    }
  };
})();
