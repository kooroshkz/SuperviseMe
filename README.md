# LIACS Supervisors Data Scraper

SuperviseMe contains a web scraper that collects information about LIACS (Leiden Institute of Advanced Computer Science) supervisors and their supervised theses.

## What comes Next...

- Analysis of the collected data using LLMs to identify research fields of supervisors.
- Output in web-based formats for easy access.

## Files

- `liacs_scraper.py` - Main scraper script
- `requirements.txt` - Python dependencies
- `liacs_supervisors_data.json` - Generated data file (4,340 theses from 142 supervisors)

## How to run locally

1. Setup environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python liacs_scraper.py
   ```
## Statistics

- 142 supervisors found
- 4,340 theses collected

## Data Source

[LIACS Thesis Repository](https://theses.liacs.nl/supervisors)