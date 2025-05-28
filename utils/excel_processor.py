import pandas as pd
import numpy as np
import os
import sys
import json
from datetime import datetime
from sklearn.preprocessing import KBinsDiscretizer

class DataChunker:
    def __init__(self):
        self.df = None
        self.chunks = {}
        self.debug_mode = False

    def set_debug_mode(self, enabled):
        self.debug_mode = enabled

    def load_data(self, file_path):
        try:
            self.df = pd.read_excel(file_path)
            self._preprocess_data()
            if self.debug_mode:
                print(f"Loaded {len(self.df)} rows")
            return True
        except Exception as e:
            if self.debug_mode:
                print(f"Error: {str(e)}")
            return False

    def _preprocess_data(self):
        for col in self.df.columns:
            if 'date' in col.lower():
                self.df[col] = pd.to_datetime(self.df[col], errors='coerce')
                self.df[f'{col}_year'] = self.df[col].dt.year
                self.df[f'{col}_month'] = self.df[col].dt.month

    def auto_chunk(self, strategy='auto'):
        best_col = None
        
        if strategy == 'auto':
            best_score = 0
            for col in self.df.columns:
                score = self._column_score(col)
                if score > best_score:
                    best_score = score
                    best_col = col
        else:
            best_col = strategy

        if best_col and np.issubdtype(self.df[best_col].dtype, np.number):
            self._numeric_chunking(best_col)
        elif pd.api.types.is_datetime64_any_dtype(self.df[best_col]):
            self._date_chunking(best_col)
        else:
            self._categorical_chunking(best_col)

    def _column_score(self, col):
        nunique = self.df[col].nunique()
        dtype = self.df[col].dtype
        if pd.api.types.is_numeric_dtype(dtype):
            return min(nunique, 10)
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            return 8
        return min(nunique, 15)

    def _numeric_chunking(self, col):
        discretizer = KBinsDiscretizer(n_bins=5, encode='ordinal', strategy='quantile')
        bins = discretizer.fit_transform(self.df[[col]]).astype(int)
        self.df[f'{col}_bins'] = [f'{col}_bin_{b+1}' for b in bins.flatten()]
        self._create_chunks(f'{col}_bins')

    def _date_chunking(self, col):
        self.df[f'{col}_year'] = self.df[col].dt.year
        self._create_chunks(f'{col}_year')

    def _categorical_chunking(self, col):
        self._create_chunks(col)

    def _create_chunks(self, col):
        self.chunks = {}
        for name, group in self.df.groupby(col):
            chunk_id = f"{col}_{name}"
            self.chunks[chunk_id] = group.to_dict('records')

    def get_all_records(self):
        all_records = []
        for chunk in self.chunks.values():
            all_records.extend(chunk)
        return all_records

if __name__ == "__main__":
    chunker = DataChunker()
    debug_mode = '--debug' in sys.argv
    chunker.set_debug_mode(debug_mode)
    
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    file_path = sys.argv[2] if '--debug' in sys.argv else sys.argv[1]

    if chunker.load_data(file_path):
        chunker.auto_chunk()
        # Directly output array of objects
        print(json.dumps(chunker.get_all_records()))
    else:
        print(json.dumps({"error": "Failed to process file"}))