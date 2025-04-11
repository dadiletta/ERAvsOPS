
ERAvsOPS/
├── main.py                     # Entry point for the application
├── config.py                   # Configuration settings
├── Procfile                    # For Render deployment
├── render.yaml                 # Render configuration
├── runtime.txt                 # Python version specification
├── requirements.txt            # Project dependencies
├── .env.example                # Example environment variables
├── app/
│   ├── __init__.py             # App initialization
│   ├── models/                 # For any data models
│   │   └── __init__.py         
│   ├── routes/                 # Route definitions
│   │   ├── __init__.py
│   │   └── main_routes.py      # Main route handlers
│   ├── services/               # Business logic and external API calls
│   │   ├── __init__.py
│   │   └── mlb_data.py         # MLB API interaction
│   ├── static/                 # Static assets
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   └── chart.js
│   │   └── logos/              # Team logos directory
│   └── templates/              # Jinja2 templates
│       └── index.html
└── data_cache.json             # Cache file for API responses