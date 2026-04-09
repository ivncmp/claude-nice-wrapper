#!/usr/bin/env python3
"""
Fact Search - Búsqueda en knowledge graph PARA

Busca facts en ~/life/ usando keywords + ranking simple.

Usage:
    search_facts.py <query> [--limit N] [--collection <name>]

Examples:
    search_facts.py "react typescript"
    search_facts.py "database migration" --limit 10
    search_facts.py "stack" --collection projects
"""

import json
import sys
import re
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime

# Config
LIFE_DIR = Path.home() / "life"
DEFAULT_LIMIT = 20

def normalize_text(text: str) -> str:
    """Normaliza texto para búsqueda (lowercase, sin acentos)."""
    text = text.lower()
    # Mapeo básico de acentos
    replacements = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'ü': 'u', 'ñ': 'n'
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text

def score_fact(fact: Dict, query_terms: List[str], entity_name: str) -> float:
    """
    Calcula score de relevancia de un fact.
    
    Factores:
    - Matches en fact text (peso 10)
    - Matches en entity name (peso 5)
    - accessCount (peso 1)
    - Tier hot/warm (boost)
    """
    score = 0.0
    fact_text = normalize_text(fact.get('fact', ''))
    entity_norm = normalize_text(entity_name)
    
    # Matches en fact text
    for term in query_terms:
        if term in fact_text:
            score += 10.0
            # Bonus si es exact word match
            if re.search(r'\b' + re.escape(term) + r'\b', fact_text):
                score += 5.0
    
    # Matches en entity name
    for term in query_terms:
        if term in entity_norm:
            score += 5.0
    
    # Access count (popularidad)
    score += fact.get('accessCount', 0) * 1.0
    
    # Tier boost (facts recientes son más relevantes)
    last_accessed = fact.get('lastAccessed', '')
    if last_accessed:
        try:
            accessed_date = datetime.fromisoformat(last_accessed).date()
            days_ago = (datetime.now().date() - accessed_date).days
            if days_ago <= 7:
                score *= 1.5  # Hot boost
            elif days_ago <= 30:
                score *= 1.2  # Warm boost
        except (ValueError, TypeError):
            pass
    
    return score

def search_in_entity(entity_path: Path, query_terms: List[str]) -> List[Tuple[float, Dict, str, str]]:
    """Busca en una entidad específica."""
    items_path = entity_path / "items.json"
    if not items_path.exists():
        return []
    
    try:
        with open(items_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return []
    
    entity_name = data.get('entity', entity_path.name)
    entity_type = data.get('type', 'unknown')
    facts = data.get('facts', [])
    
    results = []
    for fact in facts:
        score = score_fact(fact, query_terms, entity_name)
        if score > 0:
            results.append((score, fact, entity_name, entity_type))
    
    return results

def search_facts(query: str, collection: str = None, limit: int = DEFAULT_LIMIT) -> List[Dict]:
    """
    Busca facts en ~/life/.
    
    Args:
        query: Query string (keywords separadas por espacio)
        collection: Filtrar por collection (projects, people, companies, resources)
        limit: Máximo de resultados
    
    Returns:
        Lista de resultados ordenados por relevancia
    """
    # Normalizar query
    query_norm = normalize_text(query)
    query_terms = [term for term in query_norm.split() if len(term) >= 2]
    
    if not query_terms:
        return []
    
    # Determinar paths a buscar
    search_paths = []
    
    if collection:
        if collection == 'projects':
            search_paths = [LIFE_DIR / 'projects']
        elif collection == 'people':
            search_paths = [LIFE_DIR / 'areas' / 'people']
        elif collection == 'companies':
            search_paths = [LIFE_DIR / 'areas' / 'companies']
        elif collection == 'resources':
            search_paths = [LIFE_DIR / 'resources']
        elif collection == 'systems':
            search_paths = [LIFE_DIR / 'areas' / 'systems']
        elif collection == 'events':
            search_paths = [LIFE_DIR / 'areas' / 'events']
        else:
            print(f"⚠️  Unknown collection '{collection}', searching all")
            search_paths = [
                LIFE_DIR / 'projects',
                LIFE_DIR / 'areas' / 'people',
                LIFE_DIR / 'areas' / 'companies',
                LIFE_DIR / 'areas' / 'systems',
                LIFE_DIR / 'areas' / 'events',
                LIFE_DIR / 'resources'
            ]
    else:
        # Buscar en todas las collections
        search_paths = [
            LIFE_DIR / 'projects',
            LIFE_DIR / 'areas' / 'people',
            LIFE_DIR / 'areas' / 'companies',
            LIFE_DIR / 'areas' / 'systems',
            LIFE_DIR / 'areas' / 'events',
            LIFE_DIR / 'resources'
        ]
    
    # Recopilar entidades
    entities = []
    for base_path in search_paths:
        if not base_path.exists():
            continue
        for entity_path in base_path.iterdir():
            if entity_path.is_dir():
                entities.append(entity_path)
    
    # Buscar en cada entidad
    all_results = []
    for entity_path in entities:
        results = search_in_entity(entity_path, query_terms)
        all_results.extend(results)
    
    # Ordenar por score (descendente)
    all_results.sort(key=lambda x: x[0], reverse=True)
    
    # Formatear resultados
    formatted_results = []
    for score, fact, entity_name, entity_type in all_results[:limit]:
        formatted_results.append({
            'score': round(score, 2),
            'entity': entity_name,
            'entity_type': entity_type,
            'fact_id': fact.get('id'),
            'fact': fact.get('fact'),
            'category': fact.get('category'),
            'timestamp': fact.get('timestamp'),
            'lastAccessed': fact.get('lastAccessed'),
            'accessCount': fact.get('accessCount', 0)
        })
    
    return formatted_results

def print_results(results: List[Dict], query: str):
    """Imprime resultados de forma legible."""
    if not results:
        print(f"❌ No results found for: {query}")
        return
    
    print(f"🔍 Search results for: '{query}'")
    print(f"{'=' * 80}")
    print(f"Found {len(results)} fact(s)\n")
    
    for i, result in enumerate(results, 1):
        print(f"{i}. [{result['entity']}] {result['fact_id']} (score: {result['score']})")
        print(f"   📝 {result['fact']}")
        print(f"   📂 Category: {result['category']} | Type: {result['entity_type']}")
        print(f"   📊 Access: {result['accessCount']}x | Last: {result['lastAccessed']}")
        print()

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Search facts in PARA knowledge graph")
    parser.add_argument('query', type=str, help="Search query (keywords)")
    parser.add_argument('--limit', type=int, default=DEFAULT_LIMIT, help=f"Max results (default: {DEFAULT_LIMIT})")
    parser.add_argument('--collection', type=str, choices=['projects', 'people', 'companies', 'resources', 'systems', 'events'], help="Filter by collection")
    parser.add_argument('--json', action='store_true', help="Output JSON instead of human-readable")
    
    args = parser.parse_args()
    
    results = search_facts(args.query, collection=args.collection, limit=args.limit)
    
    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print_results(results, args.query)

if __name__ == "__main__":
    main()
