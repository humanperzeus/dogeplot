#!/usr/bin/env python3
import subprocess
import re
import os
from typing import List, Set
import sys

class GitHistoryCleaner:
    def __init__(self):
        self.sensitive_patterns = [
            # API Keys
            r'(?i)api[_-]?key["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            r'(?i)api[_-]?secret["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            
            # Specific Service Keys
            r'(?i)openai[_-]?api[_-]?key["\']?\s*(?::|=)\s*["\']?sk-[\w\-]+["\']?',
            r'(?i)gemini[_-]?api[_-]?key["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            r'(?i)congress[_-]?api[_-]?key["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            r'(?i)supabase[_-]?(?:url|key)["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            
            # General Tokens and Secrets
            r'(?i)token["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            r'(?i)secret["\']?\s*(?::|=)\s*["\']?[\w\-]{16,}["\']?',
            r'(?i)password["\']?\s*(?::|=)\s*["\']?[\w\-]{8,}["\']?',
            
            # Environment Variables
            r'(?i)VITE_[\w_]*KEY[\w_]*=["\']?[\w\-]{8,}["\']?',
            r'(?i)VITE_[\w_]*SECRET[\w_]*=["\']?[\w\-]{8,}["\']?',
            r'(?i)VITE_[\w_]*TOKEN[\w_]*=["\']?[\w\-]{8,}["\']?',
            
            # URLs with credentials
            r'(?i)https?://[^:\s]+:[^@\s]+@[^\s]+',
            
            # Common Environment File Patterns
            r'(?m)^\s*(?:export\s+)?[\w_]+=.+$'
        ]
        
        self.sensitive_files = [
            '.env',
            '.env.local',
            '.env.development',
            '.env.production',
            '.env.staging',
            'credentials.json',
            'config.json',
            'secrets.json',
            '*.key',
            '*.pem',
            '*.pfx',
            '*.p12',
            '*.keystore'
        ]

    def scan_commit(self, commit_hash: str) -> Set[str]:
        """Scan a specific commit for sensitive data."""
        found_sensitive = set()
        
        try:
            # Get commit content
            diff = subprocess.check_output(
                ['git', 'show', commit_hash],
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            # Check for sensitive patterns
            for pattern in self.sensitive_patterns:
                matches = re.finditer(pattern, diff)
                for match in matches:
                    found_sensitive.add(f"[{commit_hash}] Found pattern: {pattern}")
            
            return found_sensitive
            
        except subprocess.CalledProcessError:
            print(f"Error scanning commit {commit_hash}")
            return set()

    def scan_history(self) -> List[str]:
        """Scan entire Git history for sensitive data."""
        print("Scanning Git history for sensitive data...")
        
        # Get all commit hashes
        commits = subprocess.check_output(
            ['git', 'log', '--format=%H'],
            universal_newlines=True
        ).splitlines()
        
        all_findings = []
        total_commits = len(commits)
        
        for i, commit in enumerate(commits, 1):
            findings = self.scan_commit(commit)
            if findings:
                all_findings.extend(findings)
            
            # Progress indicator
            print(f"\rScanning commits: {i}/{total_commits}", end='')
            
        print("\nScan complete!")
        return all_findings

    def clean_history(self):
        """Clean sensitive data from Git history."""
        print("Creating backup of current state...")
        backup_dir = "git_backup_" + subprocess.check_output(
            ['date', '+%Y%m%d_%H%M%S'],
            universal_newlines=True
        ).strip()
        
        os.makedirs(backup_dir, exist_ok=True)
        subprocess.run(['git', 'bundle', 'create', f'{backup_dir}/backup.bundle', '--all'])
        
        print("\nCleaning sensitive files from history...")
        sensitive_files_arg = " ".join(self.sensitive_files)
        
        # Use git filter-repo to remove sensitive files
        subprocess.run([
            'git', 'filter-repo',
            '--force',
            '--invert-paths',
            '--paths', sensitive_files_arg
        ])
        
        print("\nRemoving sensitive data patterns...")
        for pattern in self.sensitive_patterns:
            subprocess.run([
                'git', 'filter-repo',
                '--force',
                '--replace-text', '-',
            ], input=f'{pattern}===>REMOVED_SENSITIVE_DATA\n'.encode())

def main():
    cleaner = GitHistoryCleaner()
    
    print("Git History Cleaner")
    print("==================")
    print("\nThis script will:")
    print("1. Scan your Git history for sensitive data")
    print("2. Create a backup of your current repository")
    print("3. Clean sensitive data from the history")
    print("\nWarning: This will rewrite your Git history!")
    
    response = input("\nDo you want to proceed? (yes/no): ")
    if response.lower() != 'yes':
        print("Operation cancelled.")
        return
    
    findings = cleaner.scan_history()
    
    if findings:
        print("\nFound sensitive data in the following commits:")
        for finding in findings:
            print(finding)
            
        response = input("\nDo you want to clean the repository? (yes/no): ")
        if response.lower() == 'yes':
            cleaner.clean_history()
            print("\nRepository cleaned! Please:")
            print("1. Review the changes")
            print("2. Force push to remote: git push origin --force --all")
            print("3. Update all sensitive credentials that were exposed")
        else:
            print("Cleaning cancelled.")
    else:
        print("\nNo sensitive data found in Git history.")

if __name__ == "__main__":
    main() 