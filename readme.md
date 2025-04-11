# MLB ERA vs OPS Visualization

A web application that visualizes MLB team performance by plotting Earned Run Average (ERA) against On-base Plus Slugging (OPS) in an interactive scatter plot.

## 📊 Overview

This tool helps baseball analysts and fans visualize team performance by placing teams in quadrants:

- **Good Pitching, Good Hitting**: Teams excelling in both areas (low ERA, high OPS)
- **Good Pitching, Bad Hitting**: Teams with strong pitching but weaker offense
- **Bad Pitching, Good Hitting**: Teams with strong offense but weaker pitching
- **Bad Pitching, Bad Hitting**: Teams struggling in both areas

## 🚀 Features

- Interactive scatter plot with team logos
- Quadrant analysis with color-coded backgrounds
- Automatic data updates (configurable cache timeouts)
- Responsive design that works on desktop and mobile
- Hover tooltips with detailed team statistics

## 🛠️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/eravsops.git
   cd eravsops
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your configuration:
   ```
   FLASK_ENV=development
   SECRET_KEY=your-secret-key
   CACHE_TIMEOUT=3600
   ```

5. Run the application:
   ```bash
   python main.py
   ```

## 🔄 Data Source

This application uses baseball-data-scraper to fetch team statistics. Data is cached to minimize API requests and improve performance.

## 🖼️ Team Logos

Team logos should be placed in the `app/static/logos/` directory with filenames matching the team abbreviation in lowercase (e.g., `nyy.png` for the Yankees).

## 📱 Deployment

The application is configured for deployment on Render:

1. Connect your GitHub repository to Render
2. Create a new Web Service using the Python runtime
3. The included `render.yaml` will handle the configuration

## 📝 Configuration

Key configuration options in `config.py`:

- `CACHE_TIMEOUT`: How long to keep data before refreshing (in seconds)
- `CACHE_FILE`: Location of the data cache file
- `SECRET_KEY`: Flask session security key

## 📂 Project Structure

```
eravsops/
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
│   ├── routes/                 # Route definitions
│   │   ├── __init__.py
│   │   └── main_routes.py      # Main route handlers
│   ├── services/               # Business logic and data fetching
│   │   ├── __init__.py
│   │   └── mlb_data.py         # MLB data handling
│   ├── static/                 # Static assets
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   └── chart.js
│   │   └── logos/              # Team logos directory
│   └── templates/              # Jinja2 templates
│       └── index.html
└── data_cache.json             # Cache file for API responses
```

## 📊 Customization

- **Logo Size**: Adjust the `--logo-width` variable in CSS
- **Quadrant Colors**: Modify the `quadrantColors` object in `chart.js`
- **Chart Dimensions**: Change scales in the Chart.js configuration
- **Boundary Lines**: Adjust the `axisLines` values in `chart.js`

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- [Chart.js](https://www.chartjs.org/) for the visualization library
- [Flask](https://flask.palletsprojects.com/) for the web framework
- MLB for team information and statistics