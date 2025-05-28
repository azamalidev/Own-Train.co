import nltk
import sys
import json
import re
import types
from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.corpus import stopwords, wordnet
from nltk import pos_tag
from nltk.stem import WordNetLemmatizer
from nltk.chunk import ne_chunk
from collections import defaultdict

class EnhancedQueryProcessor:
    def __init__(self):
        # Initialize NLTK components
        self.lemmatizer = WordNetLemmatizer()
        self.stop_words = set(stopwords.words('english'))
        
        # Configuration
        self.ignore_synonyms_for = {'can', 'i', '?', '!'}
        self.question_words = {'what', 'where', 'when', 'why', 'how', 'who', 'which', 'whose', 'whom'}
        self.action_verbs = {'buy', 'purchase', 'find', 'search', 'look', 'show', 'explain', 'tell', 
                           'get', 'need', 'want', 'compare', 'check', 'see', 'recommend'}
        self.intensifiers = {'very', 'really', 'extremely', 'absolutely', 'completely'}
        
        # Enhanced domain entities and synonyms
        self.domain_entities = {
            'product': ['phone', 'laptop', 'tv', 'camera', 'headphone', 'notebook', 'computer'],
            'tech': ['spec', 'specification', 'feature', 'price', 'review', 'rating']
        }
        # POS tags to skip
        self.skip_tags = {'NNP', 'NNPS', 'CD', 'PRP', 'DT', 'CC', 'UH', 'IN', '.', ',', ':', 'POS', 'MD'}
        
        
        self.domain_synonyms = {
            'buy': ['purchase', 'order', 'get', 'acquire'],
            'laptop': ['notebook', 'computer', 'macbook', 'chromebook']
        }
        
        # Initialize NER capability
        self.ner_available = self._check_ner_availability()

    def _check_ner_availability(self):
        """Check if named entity recognition is available"""
        try:
            nltk.data.find('chunkers/maxent_ne_chunker')
            return True
        except LookupError:
            return False
    def is_valid_synonym(self, candidate, original_token):
            """Validate if candidate is a good synonym"""
            if candidate == original_token:
                return False
                
            # Basic filtering
            if (len(candidate) <= 2 or
                candidate in self.stop_words or
                candidate in self.ignore_synonyms_for):
                return False
                
            # Filter special characters (allow hyphens and spaces)
            if not re.match(r'^[a-z]+(?:[- ][a-z]+)*$', candidate):
                return False
                
            return True
    def process_query(self, query):
        try:
            cleaned_query = self.clean_query(query)
            sentences = sent_tokenize(cleaned_query)
            
            results = []
            for sentence in sentences:
                tokens = word_tokenize(sentence)
                pos_tags = self.enhanced_pos_tagging(tokens)
                filtered_tokens = self.context_aware_stopword_filter(tokens, pos_tags)
                lemmatized = self.lemmatize_tokens(filtered_tokens, pos_tags)
                
                named_entities = []
                noun_phrases = []
                
                if self.ner_available:
                    try:
                        named_entities = self.serialize_named_entities(tokens, pos_tags)
                        noun_phrases = self.extract_noun_phrases(tokens, pos_tags)
                    except Exception as e:
                        self.ner_available = False
                        print(f"Warning: Named entity recognition failed. Error: {str(e)}")
                
                expanded = self.expand_synonyms(lemmatized, pos_tags)
                entities = self.extract_entities(lemmatized, pos_tags, noun_phrases)
                reconstructed = self.reconstruct_query(lemmatized, pos_tags,entities,expanded)
                results.append({
                    "original_sentence": sentence,
                    "tokens": tokens,
                    "pos_tags": [(word, str(tag)) for word, tag in pos_tags],
                    "filtered_tokens": filtered_tokens,
                    "lemmatized": lemmatized,
                    "named_entities": named_entities,
                    "noun_phrases": noun_phrases,
                    "expanded_with_synonyms": expanded,
                    "entities": self.serialize_entities(entities),
                    "processed_query": reconstructed,
                    "ner_available": self.ner_available
                })
            
            return {
                "original_query": query,
                "sentences": results,
                "status": "success",
                "ner_available": self.ner_available,
                "ner_install_hint": "To enable full named entity recognition, run: import nltk; nltk.download('maxent_ne_chunker')" if not self.ner_available else None
            }
            
        except Exception as e:
            return {
                "original_query": query,
                "status": "error",
                "message": str(e),
                "ner_available": self.ner_available,
                "ner_install_hint": "To enable full named entity recognition, run: import nltk; nltk.download('maxent_ne_chunker')" if not self.ner_available else None
            }

    def serialize_named_entities(self, tokens, pos_tags):
        """Convert NLTK named entity tree to serializable format"""
        tree = ne_chunk(pos_tags)
        named_entities = []
        
        for node in tree:
            if isinstance(node, nltk.Tree):
                entity_name = ' '.join([token for token, pos in node.leaves()])
                entity_type = node.label()
                named_entities.append({"text": entity_name, "type": entity_type})
            else:
                token, pos = node
                if pos in ['NNP', 'NNPS'] and token.isupper():
                    named_entities.append({"text": token, "type": "ORGANIZATION"})
        
        return named_entities

    def extract_noun_phrases(self, tokens, pos_tags):
        """Extract noun phrases without requiring special NLTK resources"""
        noun_phrases = []
        current_phrase = []
        
        for word, tag in pos_tags:
            if tag.startswith('NN') or tag.startswith('JJ'):
                current_phrase.append(word)
            else:
                if current_phrase:
                    noun_phrases.append(' '.join(current_phrase))
                    current_phrase = []
        
        if current_phrase:
            noun_phrases.append(' '.join(current_phrase))
            
        return noun_phrases

    def serialize_entities(self, entities):
        """Ensure all entities are serializable"""
        return {
            "named_entities": entities["named_entities"],
            "noun_phrases": entities["noun_phrases"],
            "domain_entities": [
                {"text": text, "type": type_} 
                for text, type_ in entities["domain_entities"]
            ],
            "all_entities": entities["all_entities"]
        }

    def clean_query(self, query):
        """Basic query cleaning while preserving meaning"""
        query = query.lower().strip()
        query = re.sub(r'[^\w\s\?]', '', query)
        return query
    
    def enhanced_pos_tagging(self, tokens):
        """Enhanced POS tagging with handling for special cases"""
        pos_tags = pos_tag(tokens)
        enhanced_tags = []
        for i, (word, tag) in enumerate(pos_tags):
            # Handle pronouns
            if word.lower() in {'i', 'me', 'my', 'you', 'he', 'she', 'we', 'they'}:
                enhanced_tags.append((word, 'PRP'))
                continue
                
            if word.replace(',', '').replace('.', '').isdigit():
                enhanced_tags.append((word, 'CD'))
                continue
            if re.match(r'^\$?\d+(,\d{3})*(\.\d+)?$', word):
                enhanced_tags.append((word, 'CD'))
                continue
            if i > 0 and pos_tags[i-1][0].lower() in self.question_words:
                if tag.startswith('NN'):
                    enhanced_tags.append((word, 'NN-Q'))
                    continue
            enhanced_tags.append((word, tag))
        return enhanced_tags
    
    def context_aware_stopword_filter(self, tokens, pos_tags):
        """Remove stopwords while preserving important contextual words"""
        filtered = []
        for i, (word, tag) in enumerate(pos_tags):
            lower_word = word.lower()
            keep = (
                lower_word in self.question_words or
                tag == 'CD' or
                tag in ['NNP', 'NNPS'] or
                (i > 0 and pos_tags[i-1][0].lower() in self.question_words) or
                tag.startswith(('VB', 'JJ', 'RB')) or
                lower_word in {'not', 'no', 'never'}
            )
            if not keep and lower_word in self.stop_words:
                continue
            filtered.append(word)
        return filtered
    
    def lemmatize_tokens(self, tokens, pos_tags):
        """Enhanced lemmatization with POS consideration"""
        lemmatized = []
        for word, tag in pos_tags:
            if tag in ['NNP', 'NNPS', 'CD', 'PRP']:
                lemmatized.append(word)
                continue
            pos = self.get_wordnet_pos(tag)
            if pos:
                lemma = self.lemmatizer.lemmatize(word, pos)
                lemmatized.append(lemma)
            else:
                lemmatized.append(word)
        return lemmatized
    
    def get_wordnet_pos(self, tag):
        """Map POS tag to WordNet POS tag with more granularity"""
        if isinstance(tag, str):  # Ensure tag is string
            if tag.startswith('J'):
                return wordnet.ADJ
            elif tag.startswith('V'):
                return wordnet.VERB
            elif tag.startswith('N'):
                return wordnet.NOUN
            elif tag.startswith('R'):
                return wordnet.ADV
        return None
    
    def expand_synonyms(self, tokens, pos_tags):
        """Enhanced synonym expansion with more efficient filtering and context relevance"""
        expanded = []

        for token, (word, tag) in zip(tokens, pos_tags):
            lower_token = token.lower()

            # Skip function words, stop words, unwanted tags or tokens with very short length
            if (
                lower_token in self.ignore_synonyms_for or
                lower_token in self.stop_words or
                tag in ['NNP', 'NNPS', 'CD', 'PRP', 'DT', 'CC', 'UH', 'IN', '.', ',', ':'] or
                len(lower_token) <= 2 or
                not tag[0].isalpha()
            ):
                expanded.append(token)
                continue

            # First check for domain-specific synonyms (if available)
            if lower_token in self.domain_synonyms:
                expanded.append(token)
                expanded.extend(self.domain_synonyms[lower_token][:2])
                continue

            # Determine part-of-speech (POS) for more accurate synonyms
            pos = self.get_wordnet_pos(tag)
            synsets = wordnet.synsets(lower_token, pos=pos) if pos else wordnet.synsets(lower_token)

            # Collect synonyms with their usage counts for ranking
            synonym_freq = {}
            for syn in synsets:
                for lemma in syn.lemmas():
                    synonym = lemma.name().replace('_', ' ').lower()

                    # Filter out invalid synonyms (same as token, stop words, multi-word)
                    if (
                        synonym != lower_token and
                        synonym not in self.ignore_synonyms_for and
                        synonym not in self.stop_words
                    ):
                        # Include multi-word synonyms (if they are meaningful)
                        if len(synonym.split()) > 1 and all(c.isalnum() or c.isspace() for c in synonym):
                            synonym_freq[synonym] = synonym_freq.get(synonym, 0) + 1
                        elif len(synonym.split()) == 1 and all(c.isalnum() for c in synonym):
                            # Prefer shorter synonyms (more relevant)
                            freq = lemma.count()
                            if freq > 1:
                                synonym_freq[synonym] = max(synonym_freq.get(synonym, 0), freq)

            # Sort synonyms by frequency and relevance (adjust ranking logic as needed)
            sorted_synonyms = sorted(synonym_freq.items(), key=lambda x: x[1], reverse=True)
            top_synonyms = [syn for syn, _ in sorted_synonyms[:3]]  # Adjust top synonyms limit

            expanded.append(token)
            if top_synonyms:
                expanded.extend(top_synonyms)

        return expanded
    
    def extract_entities(self, lemmatized, pos_tags, noun_phrases):
        """Enhanced entity extraction with domain awareness"""
        entities = []
        named_entities = self.serialize_named_entities([w for w, _ in pos_tags], pos_tags)
        entities.extend([ne["text"] for ne in named_entities])
        entities.extend(noun_phrases)
        
        domain_entities = []
        for token in lemmatized:
            for entity_type, terms in self.domain_entities.items():
                if token in terms and token not in entities:
                    domain_entities.append((token, entity_type))
        
        for word, tag in pos_tags:
            if tag == 'CD' and word not in entities:
                entities.append(word)
            elif tag.startswith('JJ') and word not in self.intensifiers and word not in entities:
                entities.append(word)
        
        seen = set()
        unique_entities = []
        for entity in entities:
            if entity not in seen:
                seen.add(entity)
                unique_entities.append(entity)
                
        return {
            "named_entities": named_entities,
            "noun_phrases": noun_phrases,
            "domain_entities": domain_entities,
            "all_entities": unique_entities
        }
    
    def reconstruct_query(self, lemmatized, pos_tags, entities=None, expanded_with_synonyms=None):
        """
        Create a single, clean, intelligent query from lemmatized words, POS tags,
        optional named entities, and synonyms — ready for embedding.
        """

        # Normalize 'i'
        lemmatized = [word if word.lower() != 'i' else 'I' for word in lemmatized]

        # Define helper stop words to ignore in final context
        stop_words = {'i', 'can', 'please', 'would', 'like', 'want', 'to', 'let', 'me', 'you', 'show'}

        # Step 1: Detect main action verb (e.g., need, get, find)
        action = next((word for word in lemmatized if word in self.action_verbs), "request")

        # Step 2: Extract nouns and key tokens (filtering helpers and action)
        key_tokens = [
            word for word, tag in pos_tags 
            if word.lower() not in stop_words and word != action and tag.startswith(('NN', 'NNS', 'JJ'))
        ]

        # Step 3: Merge named entities if present
        if entities and entities.get("named_entities"):
            key_tokens.extend([
                ne["text"] for ne in entities["named_entities"] if "text" in ne
            ])

        # Step 4: Replace with best-fit domain synonyms (if available)
        if expanded_with_synonyms:
            synonym_map = {}
            for word in key_tokens:
                for syn in expanded_with_synonyms:
                    if word != syn and word in syn:
                        synonym_map[word] = syn
                        break
            key_tokens = [synonym_map.get(w, w) for w in key_tokens]

        # Step 5: Construct minimal intelligent query
        final_tokens = [action] + key_tokens
        intelligent_query = " ".join(final_tokens).strip().lower()

        return intelligent_query

def default_serializer(obj):
    """Handle JSON serialization for non-standard types"""
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    elif isinstance(obj, (set, tuple, types.MappingProxyType)):
        return list(obj)
    elif isinstance(obj, (list, dict)):
        return {k: default_serializer(v) for k, v in obj.items()} if isinstance(obj, dict) else [default_serializer(v) for v in obj]
    elif hasattr(obj, '__dict__'):
        return default_serializer(obj.__dict__)
    elif isinstance(obj, type):
        return str(obj)
    else:
        try:
            return str(obj)
        except Exception:
            return None
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python query_processor.py \"your query\"")
        sys.exit(1)
    
    processor = EnhancedQueryProcessor()
    query = " ".join(sys.argv[1:])
    result = processor.process_query(query)
    
    try:
        print(json.dumps(result, indent=2, ensure_ascii=False, default=default_serializer))
    except Exception as e:
        print(json.dumps({
            "error": "Failed to serialize output",
            "message": str(e),
            "original_query": query,
            "ner_install_hint": "To enable full named entity recognition, run: import nltk; nltk.download('maxent_ne_chunker')"
        }, indent=2))

        