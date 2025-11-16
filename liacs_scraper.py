#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from urllib.parse import urljoin
import logging

logging.basicConfig(level=logging.WARNING, format='%(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class LIACSScraper:
    def __init__(self, base_url="https://theses.liacs.nl"):
        self.base_url = base_url
        self.supervisors_url = f"{base_url}/supervisors"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        
    def fetch_page(self, url, retries=3):
        for attempt in range(retries):
            try:
                response = self.session.get(url, timeout=30)
                response.raise_for_status()
                return response
            except requests.RequestException as e:
                if attempt < retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    logger.error(f"Failed to fetch {url}")
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
        
        return supervisors
    
    def parse_supervisor_page(self, supervisor_url):
        response = self.fetch_page(supervisor_url)
        if not response:
            return []
        
        soup = BeautifulSoup(response.content, 'html.parser')
        theses = []
        
        table = soup.find('table')
        if not table:
            return []
        
        rows = table.find_all('tr')[1:]
        
        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 5:
                program = cells[0].get_text(strip=True)
                role = cells[2].get_text(strip=True)
                thesis_title = cells[4].get_text(strip=True)
                
                if program and role and thesis_title:
                    theses.append({
                        'program': program,
                        'role': role,
                        'thesis': thesis_title
                    })
        
        return theses
    
    def scrape_all_supervisors(self):
        supervisors = self.parse_supervisors_list()
        if not supervisors:
            logger.error("No supervisors found")
            return {}
        
        all_data = {}
        
        for i, supervisor in enumerate(supervisors, 1):
            name = supervisor['name']
            url = supervisor['url']
            
            print(f"Processing {i}/{len(supervisors)}: {name}")
            
            theses = self.parse_supervisor_page(url)
            all_data[name] = theses
            time.sleep(1)
        
        return all_data
    
    def save_to_json(self, data, filename="liacs_supervisors_data.json"):
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return filename
        except Exception as e:
            logger.error(f"Failed to save data: {e}")
            return None

def main():
    scraper = LIACSScraper()
    
    try:
        data = scraper.scrape_all_supervisors()
        
        if data:
            filepath = scraper.save_to_json(data)
            total_theses = sum(len(theses) for theses in data.values())
            print(f"Completed: {len(data)} supervisors, {total_theses} theses")
        else:
            print("No data collected")
            
    except KeyboardInterrupt:
        print("Interrupted")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()