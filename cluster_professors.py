#!/usr/bin/env python3

import requests
import json
import os
import time
import signal
import sys
from datetime import datetime
from dotenv import load_dotenv
from typing import Dict, List

load_dotenv()

class ProfessorClusterer:
    def __init__(self):
        self.api_key = os.getenv('OPENROUTER_API_KEY')
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY not found in .env file")
        
        self.requests_per_minute = 15
        self.min_request_interval = 60.0 / self.requests_per_minute
        self.last_request_time = 0
        
        self.top_level_categories = [
            "Theory", "Natural computing", "Machine learning", "Data science",
            "Software", "Business", "Systems", "Security", "Human-aligned AI",
            "Bioinformatics", "Programming Education", "Methods", "Statistics", "Cognitive Psychology"
        ]
        
        self.results = {}
        self.checkpoint_file = "clustering_checkpoint.json"
        self.start_time = None
        
        signal.signal(signal.SIGINT, self.save_and_exit)
    
    def save_and_exit(self, sig, frame):
        print("\nSaving progress...")
        self.save_checkpoint()
        print(f"Progress saved to {self.checkpoint_file}")
        sys.exit(0)
    
    def load_checkpoint(self):
        if os.path.exists(self.checkpoint_file):
            with open(self.checkpoint_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.results = data.get('results', {})
                print(f"Loaded checkpoint: {len(self.results)} professors already processed")
                return True
        return False
    
    def save_checkpoint(self):
        checkpoint = {
            'timestamp': datetime.now().isoformat(),
            'processed_count': len(self.results),
            'results': self.results
        }
        with open(self.checkpoint_file, 'w', encoding='utf-8') as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    
    def wait_for_rate_limit(self):
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_request_interval:
            wait_time = self.min_request_interval - time_since_last
            if wait_time > 0.1:
                print(f"Rate limiting: waiting {wait_time:.1f}s")
            time.sleep(wait_time)
        
        self.last_request_time = time.time()
        
    def call_openrouter_api(self, messages: List[Dict], max_retries: int = 5) -> str:
        self.wait_for_rate_limit()
        
        base_wait_time = 30  # Start with 30 seconds
        
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    url="https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    data=json.dumps({
                        "model": "qwen/qwen-2.5-72b-instruct:free",
                        "messages": messages
                    }),
                    timeout=120  # Increased timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result['choices'][0]['message']['content']
                elif response.status_code == 429:  # Rate limited
                    # Exponential backoff with longer waits
                    wait_time = base_wait_time * (2 ** attempt)
                    wait_time = min(wait_time, 300)  # Cap at 5 minutes
                    print(f"Rate limited by API. Waiting {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"API call failed with status {response.status_code}: {response.text}")
                    if attempt < max_retries - 1:
                        wait_time = 10 * (attempt + 1)
                        print(f"Waiting {wait_time}s before retry")
                        time.sleep(wait_time)
                        continue
                    else:
                        return None
                        
            except Exception as e:
                print(f"API exception (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    wait_time = 15 * (attempt + 1)
                    print(f"Exception recovery: waiting {wait_time}s")
                    time.sleep(wait_time)
                    continue
                else:
                    return None
                    
        print(f"All {max_retries} attempts exhausted")
        return None
    
    def create_clustering_prompt(self, professor_name: str, thesis_list: List[Dict]) -> str:
        thesis_titles = [thesis['thesis'] for thesis in thesis_list]
        
        prompt = f"""Analyze the research focus of Professor {professor_name} based on their supervised thesis titles and classify them into research categories.

THESIS TITLES:
{chr(10).join([f"- {title}" for title in thesis_titles])}

TOP-LEVEL RESEARCH CATEGORIES:
{chr(10).join([f"- {cat}" for cat in self.top_level_categories])}

TASK:
1. Analyze all thesis titles to understand the professor's main research areas
2. Assign the professor to 1-3 most relevant TOP-LEVEL categories (be conservative, only assign if there's strong evidence)
3. For each assigned top-level category, suggest 1-2 specific subcategories that best describe their research focus
4. Be confident in your clustering - don't assign categories based on just one thesis unless there's overwhelming evidence

RESPONSE FORMAT (JSON only):
{{
  "professor_name": "{professor_name}",
  "primary_research_areas": [
    {{
      "top_level": "Category Name",
      "subcategories": ["Subcategory 1", "Subcategory 2"],
      "confidence": "high/medium/low",
      "evidence_count": number_of_supporting_theses
    }}
  ],
  "analysis_summary": "Brief explanation of the classification reasoning"
}}

Provide ONLY the JSON response, no additional text."""

        return prompt
    
    def process_professor(self, professor_name: str, thesis_list: List[Dict]) -> Dict:
        if not thesis_list:
            return {
                "professor_name": professor_name,
                "primary_research_areas": [],
                "analysis_summary": "No thesis data available"
            }
        
        prompt = self.create_clustering_prompt(professor_name, thesis_list)
        messages = [{"role": "user", "content": prompt}]
        
        response = self.call_openrouter_api(messages)
        
        if response:
            try:
                # Extract JSON from response (in case there's extra text)
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start != -1 and json_end != -1:
                    json_str = response[json_start:json_end]
                    result = json.loads(json_str)
                    result['processing_timestamp'] = datetime.now().isoformat()
                    return result
                else:
                    return {"error": "Invalid JSON response", "raw_response": response}
            except json.JSONDecodeError as e:
                return {"error": f"JSON parsing failed: {e}", "raw_response": response}
        else:
            return {"error": "API call failed"}
    
    def cluster_all_professors(self, data_file: str = "liacs_supervisors_data.json"):
        print("Loading professor data...")
        with open(data_file, 'r', encoding='utf-8') as f:
            professors_data = json.load(f)
        
        total_professors = len(professors_data)
        
        # Load checkpoint if available
        self.load_checkpoint()
        already_processed = len(self.results)
        
        print(f"Total professors: {total_professors}")
        print(f"Already processed: {already_processed}")
        print(f"Remaining: {total_professors - already_processed}")
        
        if already_processed >= total_professors:
            print("All professors already processed")
            return self.results
        
        print(f"Rate limit: {self.requests_per_minute} req/min ({self.min_request_interval:.1f}s per request)")
        
        # Calculate ETA
        remaining = total_professors - already_processed
        estimated_time_hours = (remaining * self.min_request_interval) / 3600
        
        print(f"Estimated time: {estimated_time_hours:.1f} hours")
        print("\nStarting clustering process...\n")
        
        self.start_time = time.time()
        
        for i, (professor_name, thesis_list) in enumerate(professors_data.items()):
            # Skip if already processed
            if professor_name in self.results:
                continue
                
            current_num = already_processed + len([p for p in professors_data.keys() if p in self.results and list(professors_data.keys()).index(p) <= i]) + 1
            
            print(f"[{current_num}/{total_professors}] Processing: {professor_name} ({len(thesis_list)} theses)")
            
            try:
                result = self.process_professor(professor_name, thesis_list)
                self.results[professor_name] = result
                
                # Show result summary
                if "error" not in result and "primary_research_areas" in result:
                    areas = [area['top_level'] for area in result['primary_research_areas']]
                    print(f"   → {', '.join(areas) if areas else 'No clear classification'}")
                else:
                    print(f"   → {result.get('error', 'Unknown error')}")
                
                # Progress and ETA calculation
                processed_now = len(self.results) - already_processed
                if processed_now > 0 and self.start_time:
                    elapsed = time.time() - self.start_time
                    rate_per_second = processed_now / elapsed
                    remaining_to_process = total_professors - len(self.results)
                    eta_seconds = remaining_to_process / rate_per_second if rate_per_second > 0 else 0
                    eta_minutes = eta_seconds / 60
                    
                    print(f"   📈 Progress: {(len(self.results)/total_professors)*100:.1f}% | ETA: {eta_minutes:.1f} min\n")
                
                # Save checkpoint every 3 professors (more frequent)
                if len(self.results) % 3 == 0:
                    self.save_checkpoint()
                    
            except Exception as e:
                print(f"   💥 Exception: {e}")
                self.results[professor_name] = {"error": str(e)}
                # Longer delay on errors to let rate limits reset
                print(f"   ⏳ Error recovery: waiting 30 seconds...")
                time.sleep(30)
                
        return self.results
    
    def save_results(self, results: Dict, filename: str = "professor_research_clusters.json"):
        filepath = f"/Users/kooroshkz/Desktop/SuperviseMe/{filename}"
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"Results saved to {filepath}")
    
    def generate_cluster_summary(self, results: Dict):
        summary = {
            "total_professors": len(results),
            "successfully_processed": 0,
            "errors": 0,
            "category_distribution": {},
            "subcategory_distribution": {}
        }
        
        for professor_name, result in results.items():
            if "error" in result:
                summary["errors"] += 1
            elif "primary_research_areas" in result:
                summary["successfully_processed"] += 1
                
                for area in result["primary_research_areas"]:
                    top_level = area.get("top_level")
                    if top_level:
                        if top_level not in summary["category_distribution"]:
                            summary["category_distribution"][top_level] = 0
                        summary["category_distribution"][top_level] += 1
                        
                        for subcat in area.get("subcategories", []):
                            if subcat not in summary["subcategory_distribution"]:
                                summary["subcategory_distribution"][subcat] = 0
                            summary["subcategory_distribution"][subcat] += 1
        
        return summary

def main():
    try:
        clusterer = ProfessorClusterer()
        
        print("LIACS Professor Research Clustering System")
        print("=" * 50)
        
        results = clusterer.cluster_all_professors()
        
        print("\n💾 Saving final results...")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_file = f"professor_clusters_{timestamp}.json"
        clusterer.save_results(results, final_file)
        
        print("Generating summary...")
        summary = clusterer.generate_cluster_summary(results)
        summary_file = f"clustering_summary_{timestamp}.json"
        clusterer.save_results(summary, summary_file)
        
        print(f"\n🎉 Clustering complete!")
        print(f"Successfully processed: {summary['successfully_processed']}/{summary['total_professors']}")
        print(f"Errors: {summary['errors']}")
        print(f"📈 Success rate: {(summary['successfully_processed']/summary['total_professors']*100):.1f}%")
        print(f"🔝 Top categories: {dict(sorted(summary['category_distribution'].items(), key=lambda x: x[1], reverse=True)[:5])}")
        
        # Clean up checkpoint
        if os.path.exists(clusterer.checkpoint_file):
            os.remove(clusterer.checkpoint_file)
            print("🧹 Checkpoint cleaned up")
            
    except KeyboardInterrupt:
        print("\nProcess interrupted by user")
    except Exception as e:
        print(f"\n💥 Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()