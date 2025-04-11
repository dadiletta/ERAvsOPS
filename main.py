#!/usr/bin/env python3
# main.py
import os
from app import create_app

# Create application instance
app = create_app()

if __name__ == '__main__':
    # Use debug mode for local development
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    
    # Get port from environment variable or use 5000 as default
    port = int(os.getenv('PORT', 5000))
    
    # Run the application
    app.run(debug=debug, host='0.0.0.0', port=port)