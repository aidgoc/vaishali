#!/usr/bin/env python3
"""
BOM Validation Script - Extract component details from 12 selected recipes.
Reads recipe codes from selected_recipes.json and extracts full BOM component details
from ERPNext including item codes, names, quantities, rates, and amounts.
"""

import os
import sys
import json
from datetime import datetime

# Initialize Frappe context
os.chdir('/home/frappe/frappe-bench/sites')
sys.path.insert(0, '/home/frappe/frappe-bench/apps/frappe')
sys.path.insert(0, '/home/frappe/frappe-bench/apps/erpnext')

import frappe
frappe.init(site='dgoc.logstop.com')
frappe.connect()

# Recipe codes from Task 1 (selected_recipes.json)
recipes = [
    'BKC02002', 'BKD01001', 'BKC05009', 'BKA02008', 'BKH02001', 'BKA04001',
    'BKA05001', 'BKC09020', 'BKD07001', 'BKI07004', 'BKJ05001', 'BKI11001'
]

extracted_data = {
    'metadata': {
        'extracted_at': datetime.now().isoformat(),
        'total_recipes': len(recipes),
        'data_source': 'ERPNext v15',
        'site': 'dgoc.logstop.com',
        'validation_stage': 'Task 2: Component Details Extraction'
    },
    'extraction_summary': {
        'successful': 0,
        'errors': 0,
        'no_bom': 0
    },
    'recipes': []
}

print(f"Starting extraction of {len(recipes)} recipes...")

for recipe_code in recipes:
    try:
        # Get Item details
        item = frappe.get_doc('Item', recipe_code)

        # Get submitted BOMs for this item
        boms = frappe.db.get_list(
            'BOM',
            filters={'item': recipe_code, 'docstatus': 1},
            fields=['name', 'company'],
            limit_page_length=1
        )

        if not boms:
            extracted_data['recipes'].append({
                'code': recipe_code,
                'item_name': item.item_name,
                'item_group': item.item_group,
                'status': 'no_submitted_bom',
                'error': 'No submitted BOM found for this item'
            })
            extracted_data['extraction_summary']['no_bom'] += 1
            print(f"  {recipe_code}: No submitted BOM")
            continue

        # Get the BOM document
        bom = frappe.get_doc('BOM', boms[0].name)
        components = []
        total_amount = 0.0

        # Extract each component
        for item_row in bom.items:
            rate = float(item_row.rate) if item_row.rate else 0.0
            qty = float(item_row.qty) if item_row.qty else 0.0
            amount = float(item_row.amount) if item_row.amount else 0.0

            component = {
                'item_code': item_row.item_code,
                'item_name': item_row.item_name,
                'description': item_row.description or '',
                'qty': qty,
                'uom': item_row.uom or '',
                'rate': rate,
                'amount': amount
            }
            components.append(component)
            total_amount += amount

        # Build recipe data
        recipe_data = {
            'code': recipe_code,
            'item_name': item.item_name,
            'item_group': item.item_group,
            'company': bom.company,
            'bom_id': bom.name,
            'bom_status': 'submitted' if bom.docstatus == 1 else 'draft',
            'component_count': len(bom.items),
            'components': components,
            'total_bom_cost': round(total_amount, 2),
            'status': 'extracted'
        }

        extracted_data['recipes'].append(recipe_data)
        extracted_data['extraction_summary']['successful'] += 1
        print(f"  {recipe_code}: {len(components)} components, total cost ₹{total_amount:.2f}")

    except Exception as e:
        extracted_data['recipes'].append({
            'code': recipe_code,
            'status': 'error',
            'error': str(e)
        })
        extracted_data['extraction_summary']['errors'] += 1
        print(f"  {recipe_code}: ERROR - {str(e)}")

# Save results to /tmp/extracted_boms.json
output_path = '/tmp/extracted_boms.json'
with open(output_path, 'w') as f:
    json.dump(extracted_data, f, indent=2)

# Print summary
print("\n" + "=" * 60)
print("EXTRACTION SUMMARY")
print("=" * 60)
print(f"Successfully extracted: {extracted_data['extraction_summary']['successful']}/{len(recipes)}")
print(f"Errors: {extracted_data['extraction_summary']['errors']}")
print(f"No BOM found: {extracted_data['extraction_summary']['no_bom']}")
print(f"Results saved to: {output_path}")

# Print cost and component ranges
successful_recipes = [r for r in extracted_data['recipes'] if r['status'] == 'extracted']
if successful_recipes:
    costs = [r['total_bom_cost'] for r in successful_recipes]
    components = [r['component_count'] for r in successful_recipes]
    print(f"\nComponent count range: {min(components)} - {max(components)}")
    print(f"Total cost range: ₹{min(costs):.2f} - ₹{max(costs):.2f}")
    print(f"Average cost: ₹{sum(costs)/len(costs):.2f}")

frappe.destroy()
