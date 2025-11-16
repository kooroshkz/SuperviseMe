# LIACS Supervisors Data Scraper

SuperviseMe contains a web scraper that collects information about LIACS (Leiden Institute of Advanced Computer Science) supervisors and their supervised theses.

## What comes Next...

- Analysis of the collected data using LLMs to identify research fields of supervisors.
- Output in web-based formats for easy access.

## Files

- `liacs_scraper.py` - Web scraper for LIACS thesis repository
- `cluster_professors.py` - AI-powered research classification system 
- `liacs_supervisors_data.json` - Raw thesis data (4,340 theses from 142 professors)
- `final_results_llm.json` - Complete AI classification results with 100% success rate
- `requirements.txt` - Python dependencies
- `.env.example` - Environment variable template

## How to run locally

1. Setup environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python liacs_scraper.py
   # set the .env file with your OpenRouter API key
   python cluster_professors.py
   ```
## Statistics

- 142 supervisors found
- 4,340 theses collected

## Data Source

[LIACS Thesis Repository](https://theses.liacs.nl/supervisors)