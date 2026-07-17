import os
import urllib.request
import zipfile
import shutil

def download_and_extract_stockfish():
    bin_dir = os.path.join(os.path.dirname(__file__), "bin")
    if not os.path.exists(bin_dir):
        os.makedirs(bin_dir)
        
    stockfish_path = os.path.join(bin_dir, "stockfish", "stockfish.exe")
    if os.path.exists(stockfish_path):
        os.remove(stockfish_path)
        
    # URL for Stockfish 16.1 Windows x86-64 (Highly compatible, no AVX2 requirement)
    url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-windows-x86-64.zip"
    zip_path = os.path.join(bin_dir, "stockfish.zip")
    
    print(f"Downloading Stockfish from {url}...")
    urllib.request.urlretrieve(url, zip_path)
    
    print("Extracting...")
    extract_dir = os.path.join(bin_dir, "extracted")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)
        
    # Move the executable
    os.makedirs(os.path.join(bin_dir, "stockfish"), exist_ok=True)
    
    import glob
    exe_src = None
    for filepath in glob.glob(os.path.join(extract_dir, '**', '*.exe'), recursive=True):
        if 'stockfish' in filepath.lower():
            exe_src = filepath
            break
    if exe_src and os.path.exists(exe_src):
        os.rename(exe_src, stockfish_path)
        print("Stockfish extracted successfully to bin/stockfish/stockfish.exe")
    else:
        print("Could not find the executable in the extracted zip. Please check structure.")
        
    # Cleanup
    os.remove(zip_path)
    try:
        shutil.rmtree(extract_dir)
    except:
        pass
    
if __name__ == "__main__":
    download_and_extract_stockfish()
