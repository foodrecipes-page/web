#!/usr/bin/env bash
# Download raw datasets for vocabulary mining (NOT for republishing recipes).
# Run on your Mac or any machine with ~20 GB free disk.
#
# Prerequisites:
#   1. pip install kaggle
#   2. Create https://kaggle.com account → Settings → API → "Create New Token"
#      → saves kaggle.json → move to ~/.kaggle/kaggle.json && chmod 600
#
# Usage:
#   bash scripts/download-datasets.sh

set -euo pipefail

RAW_DIR="${RAW_DIR:-$HOME/frp-datasets}"
mkdir -p "$RAW_DIR"
cd "$RAW_DIR"

echo "==> Dest: $RAW_DIR"

have() { command -v "$1" >/dev/null 2>&1; }

if ! have kaggle; then
  echo "Install Kaggle CLI:  pip install --user kaggle"
  echo "Then: https://kaggle.com → Settings → Create API token → move kaggle.json to ~/.kaggle/"
  exit 1
fi

echo ""
echo "==> 1/6  RecipeNLG (2.2M recipes, ~1.3 GB)"
if [[ ! -f recipenlg/full_dataset.csv ]]; then
  kaggle datasets download -d paultimothymooney/recipenlg -p recipenlg --unzip
fi

echo ""
echo "==> 2/6  Food.com recipes & reviews (230k recipes, ~500 MB)"
if [[ ! -f food-com/RAW_recipes.csv ]]; then
  kaggle datasets download -d shuyangli94/food-com-recipes-and-user-interactions \
    -p food-com --unzip
fi

echo ""
echo "==> 3/6  Epicurious — curated editor tags (20k)"
if [[ ! -f epicurious/epi_r.csv ]]; then
  kaggle datasets download -d hugodarwood/epirecipes -p epicurious --unzip
fi

echo ""
echo "==> 4/6  Open Food Facts — ingredient master (CSV, ~3 GB)"
if [[ ! -f openfoodfacts/en.openfoodfacts.org.products.csv ]]; then
  mkdir -p openfoodfacts
  curl -L --progress-bar -o openfoodfacts/en.openfoodfacts.org.products.csv.gz \
    "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
  gunzip -f openfoodfacts/en.openfoodfacts.org.products.csv.gz
fi

echo ""
echo "==> 5/6  USDA FoodData Central — authoritative ingredient names (~400 MB)"
if [[ ! -f usda/foundation_food.json ]]; then
  mkdir -p usda && cd usda
  # Foundation dataset is the cleanest; swap for 'full' if you want everything
  curl -L --progress-bar -o fdc.zip \
    "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2024-04-18.zip"
  unzip -oq fdc.zip
  mv FoodData_Central_foundation_food_json_*.json foundation_food.json
  cd ..
fi

echo ""
echo "==> 6/6  TheMealDB — cuisine + category taxonomy (tiny)"
mkdir -p themealdb && cd themealdb
for endpoint in list.php?c=list list.php?a=list list.php?i=list categories.php; do
  out=$(echo "$endpoint" | tr '?&=' '_')
  curl -fsSL "https://www.themealdb.com/api/json/v1/1/$endpoint" -o "${out}.json"
done
cd ..

echo ""
echo "=========================================================="
echo "  Done. Disk usage:"
du -sh * 2>/dev/null
echo ""
echo "  Next: bash scripts/build-ontology.sh"
echo "=========================================================="
