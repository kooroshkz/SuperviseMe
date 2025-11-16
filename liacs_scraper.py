#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from urllib.parse import urljoin, urlparse
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class LIACSScraper:
    def __init__(self, base_url="https://theses.liacs.nl"):
        self.base_url = base_url
        self.supervisors_url = f"{base_url}/supervisors"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
    def fetch_page(self, url, retries=3):
        for attempt in range(retries):
            try:
                logger.info(f"Fetching: {url} (attempt {attempt + 1})")
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                return response
            except requests.RequestException as e:
                logger.warning(f"Attempt {attempt + 1} failed for {url}: {e}")
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    logger.error(f"Failed to fetch {url} after {retries} attempts")
                    return None
        return None
    
    def parse_supervisors_list(self):
        response = self.fetch_page(self.supervisors_url)
        if not response:
            return []
        
        soup = BeautifulSoup(response.content, 'html.parser')
        supervisors = []
        
        supervisor_links = soup.find_all('a', href=re.compile(r'/bysupervisor/\d+'))
        
        for link in supervisor_links:
            name = link.get_text(strip=True)
            href = link.get('href')
            if name and href:
                full_url = urljoin(self.base_url, href)
                supervisors.append({
                    'name': name,
                    'url': full_url
                })
                logger.info(f"Found supervisor: {name}")
        
        logger.info(f"Found {len(supervisors)} supervisors")
        return supervisors
    
    def parse_supervisor_page(self, supervisor_url):
        response = self.fetch_page(supervisor_url)
        if not response:
            return []
        
        soup = BeautifulSoup(response.content, 'html.parser')
        theses = []
        
        table = soup.find('table')
        if not table:
            logger.warning(f"No table found on {supervisor_url}")
            return []
        
        rows = table.find_all('tr')[1:]
        
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 5:
                program = cells[0].get_text(strip=True)
                year = cells[1].get_text(strip=True)
                role = cells[2].get_text(strip=True)
                student = cells[3].get_text(strip=True)
                thesis_title = cells[4].get_text(strip=True)
                
                if not program or not role or not thesis_title:
                    continue
                
                thesis_data = {
                    'program': program,
                    'role': role,
                    'thesis': thesis_title
                }
                
                theses.append(thesis_data)
        
        logger.info(f"Found {len(theses)} theses for this supervisor")
        return theses
    
    def scrape_all_supervisors(self):
        logger.info("Starting LIACS supervisor scraping...")
        
        supervisors = self.parse_supervisors_list()
        if not supervisors:
            logger.error("No supervisors found!")
            return {}
        
        all_data = {}
        
        for i, supervisor in enumerate(supervisors, 1):
            name = supervisor['name']
            url = supervisor['url']
            
            logger.info(f"Processing supervisor {i}/{len(supervisors)}: {name}")
            
            theses = self.parse_supervisor_page(url)
            all_data[name] = theses
            time.sleep(1)
        
        return all_data
    
    def save_to_json(self, data, filename="liacs_supervisors_data.json"):
        filepath = f"/Users/kooroshkz/Desktop/SuperviseMe/{filename}"
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"Data saved to {filepath}")
            return filepath
        except Exception as e:
            logger.error(f"Failed to save data to {filepath}: {e}")
            return None

def main():
    scraper = LIACSScraper()
    
    try:
        data = scraper.scrape_all_supervisors()
        
        if data:
            filepath = scraper.save_to_json(data)
            total_theses = sum(len(theses) for theses in data.values())
            print(f"Scraping completed successfully!")
            print(f"Collected data for {len(data)} supervisors")
            print(f"Total theses found: {total_theses}")
            if filepath:
                print(f"Data saved to: {filepath}")
        else:
            print("No data collected. Please check the logs for errors.")
            
    except KeyboardInterrupt:
        print("Scraping interrupted by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()