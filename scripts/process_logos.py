#!/usr/bin/env python3
"""
Logo Processing Script for MLB ERA vs OPS Visualization

This script processes team logos to ensure they have:
1. Consistent dimensions (square aspect ratio)
2. Transparent backgrounds
3. Optimized file sizes

Usage:
    python process_logos.py [--input-dir INPUT_DIR] [--output-dir OUTPUT_DIR] [--size SIZE]

Requirements:
    pip install pillow
"""
import os
import sys
import argparse
from PIL import Image

def process_logo(input_path, output_path, target_size=120):
    """Process a single logo to standardize it"""
    try:
        # Open the image
        img = Image.open(input_path)
        
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Get original dimensions
        width, height = img.size
        
        # Create a new transparent image with the target size
        new_img = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
        
        # Calculate scaling factor to fit within the target size while preserving aspect ratio
        if width > height:
            new_width = target_size
            new_height = int(height * (target_size / width))
        else:
            new_height = target_size
            new_width = int(width * (target_size / height))
        
        # Resize the original image
        resized = img.resize((new_width, new_height), Image.LANCZOS)
        
        # Calculate position to center the image
        x_offset = (target_size - new_width) // 2
        y_offset = (target_size - new_height) // 2
        
        # Paste the resized image onto the new transparent image
        new_img.paste(resized, (x_offset, y_offset), resized)
        
        # Save the processed image
        new_img.save(output_path, 'PNG', optimize=True)
        
        print(f"Processed: {os.path.basename(input_path)} -> {os.path.basename(output_path)}")
        return True
        
    except Exception as e:
        print(f"Error processing {input_path}: {str(e)}")
        return False

def process_directory(input_dir, output_dir, target_size=120):
    """Process all PNG files in a directory"""
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Track statistics
    stats = {
        'processed': 0,
        'failed': 0,
        'skipped': 0
    }
    
    # Process each PNG file
    for filename in os.listdir(input_dir):
        if filename.lower().endswith('.png'):
            input_path = os.path.join(input_dir, filename)
            output_path = os.path.join(output_dir, filename)
            
            # Skip if output file exists and is newer than input file
            if os.path.exists(output_path) and os.path.getmtime(output_path) > os.path.getmtime(input_path):
                print(f"Skipping {filename} (already processed)")
                stats['skipped'] += 1
                continue
            
            if process_logo(input_path, output_path, target_size):
                stats['processed'] += 1
            else:
                stats['failed'] += 1
    
    return stats

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Process team logos for consistent display')
    parser.add_argument('--input-dir', default='app/static/logos_original', 
                        help='Directory containing original logo files')
    parser.add_argument('--output-dir', default='app/static/logos', 
                        help='Directory to save processed logo files')
    parser.add_argument('--size', type=int, default=120, 
                        help='Target size for processed logos (square)')
    args = parser.parse_args()
    
    # Process the logos
    print(f"Processing logos from {args.input_dir} to {args.output_dir} at size {args.size}x{args.size}")
    stats = process_directory(args.input_dir, args.output_dir, args.size)
    
    # Print summary
    print("\nProcessing complete:")
    print(f"  Processed: {stats['processed']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Failed: {stats['failed']}")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())