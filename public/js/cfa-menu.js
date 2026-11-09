// Chick-fil-A Catering Menu Catalog & Quick-Add Presets
window.CFA_MENU = [
  {
    category: 'Sauces (Packets & Bottles)',
    icon: '🥫',
    items: [
      { name: 'Barbeque Sauce Packets', defaultQty: 50, unit: 'Packets', popular: true },
      { name: 'Chick-fil-A® Sauce Packets', defaultQty: 50, unit: 'Packets', popular: true },
      { name: 'Polynesian Sauce Packets', defaultQty: 30, unit: 'Packets', popular: true },
      { name: 'Garden Herb Ranch Packets', defaultQty: 25, unit: 'Packets' },
      { name: 'Honey Mustard Sauce Packets', defaultQty: 25, unit: 'Packets' },
      { name: 'Zesty Buffalo Sauce Packets', defaultQty: 20, unit: 'Packets' },
      { name: 'Sweet & Spicy Sriracha Packets', defaultQty: 20, unit: 'Packets' },
      { name: 'Honey Roasted BBQ Sauce', defaultQty: 20, unit: 'Packets' },
      { name: 'Chick-fil-A® Sauce 8oz Squeeze Bottle', defaultQty: 2, unit: 'Bottles' },
      { name: 'Barbeque Sauce 8oz Squeeze Bottle', defaultQty: 2, unit: 'Bottles' },
      { name: 'Polynesian Sauce 8oz Squeeze Bottle', defaultQty: 2, unit: 'Bottles' }
    ]
  },
  {
    category: 'Catering Trays',
    icon: '🍗',
    items: [
      { name: 'Nugget Tray (Small - 64 ct)', defaultQty: 1, unit: 'Tray' },
      { name: 'Nugget Tray (Medium - 120 ct)', defaultQty: 1, unit: 'Tray', popular: true },
      { name: 'Nugget Tray (Large - 200 ct)', defaultQty: 1, unit: 'Tray', popular: true },
      { name: 'Chick-n-Strips™ Tray (Small - 24 ct)', defaultQty: 1, unit: 'Tray' },
      { name: 'Chick-n-Strips™ Tray (Medium - 45 ct)', defaultQty: 1, unit: 'Tray' },
      { name: 'Chick-n-Strips™ Tray (Large - 75 ct)', defaultQty: 1, unit: 'Tray', popular: true },
      { name: 'Grilled Cool Wrap® Tray (Small - 6 halves)', defaultQty: 1, unit: 'Tray' },
      { name: 'Grilled Cool Wrap® Tray (Medium - 10 halves)', defaultQty: 1, unit: 'Tray' },
      { name: 'Grilled Cool Wrap® Tray (Large - 14 halves)', defaultQty: 1, unit: 'Tray' }
    ]
  },
  {
    category: 'Sides & Salads',
    icon: '🧀',
    items: [
      { name: 'Mac & Cheese Tray (Small - serves 10)', defaultQty: 1, unit: 'Tray' },
      { name: 'Mac & Cheese Tray (Medium - serves 20)', defaultQty: 1, unit: 'Tray', popular: true },
      { name: 'Fresh Fruit Tray (Small - serves 12)', defaultQty: 1, unit: 'Tray' },
      { name: 'Fresh Fruit Tray (Medium - serves 26)', defaultQty: 1, unit: 'Tray' },
      { name: 'Garden Salad Tray (Small - serves 5)', defaultQty: 1, unit: 'Tray' },
      { name: 'Garden Salad Tray (Large - serves 10)', defaultQty: 1, unit: 'Tray' },
      { name: 'Individual Waffle Potato Chips', defaultQty: 15, unit: 'Bags' }
    ]
  },
  {
    category: 'Beverages (By the Gallon)',
    icon: '🥤',
    items: [
      { name: 'Chick-fil-A® Sweet Tea Gallon', defaultQty: 2, unit: 'Gallons', popular: true },
      { name: 'Chick-fil-A® Unsweet Tea Gallon', defaultQty: 1, unit: 'Gallon' },
      { name: 'Chick-fil-A® Lemonade Gallon', defaultQty: 2, unit: 'Gallons', popular: true },
      { name: 'Chick-fil-A® Diet Lemonade Gallon', defaultQty: 1, unit: 'Gallon' },
      { name: 'Chick-fil-A® Sunjoy® Gallon', defaultQty: 2, unit: 'Gallons', popular: true },
      { name: '5 lb Bag of Chick-fil-A® Pellet Ice', defaultQty: 2, unit: 'Bags', popular: true }
    ]
  },
  {
    category: 'Boxed Meals',
    icon: '🍱',
    items: [
      { name: 'CFA Chicken Sandwich Boxed Meal', defaultQty: 10, unit: 'Boxes', popular: true },
      { name: 'Spicy Chicken Sandwich Boxed Meal', defaultQty: 10, unit: 'Boxes' },
      { name: 'Grilled Chicken Sandwich Boxed Meal', defaultQty: 5, unit: 'Boxes' },
      { name: 'Gluten-Free Bun Chicken Boxed Meal', defaultQty: 2, unit: 'Boxes' },
      { name: 'Chilled Grilled Chicken Sub Boxed Meal', defaultQty: 5, unit: 'Boxes' }
    ]
  },
  {
    category: 'Paper Goods & Utensils',
    icon: '🍴',
    items: [
      { name: 'Serving Utensils & Tongs Kit', defaultQty: 2, unit: 'Kits' },
      { name: 'Catering Plates & Napkins Kit', defaultQty: 25, unit: 'Sets', popular: true },
      { name: 'Cups with Straws (Set of 10)', defaultQty: 3, unit: 'Packs' },
      { name: 'Extra Wet Wipes Bundle (25 ct)', defaultQty: 1, unit: 'Bundle' }
    ]
  }
];

// Quick Sauce Presets for the fast phone call popup!
window.QUICK_SAUCE_PRESETS = [
  { label: '+50 Barbeque Sauces', name: 'Barbeque Sauce Packets', qty: 50, unit: 'Packets', category: 'Sauces' },
  { label: '+50 CFA Sauces', name: 'Chick-fil-A® Sauce Packets', qty: 50, unit: 'Packets', category: 'Sauces' },
  { label: '+25 Polynesian', name: 'Polynesian Sauce Packets', qty: 25, unit: 'Packets', category: 'Sauces' },
  { label: '+25 Ranch', name: 'Garden Herb Ranch Packets', qty: 25, unit: 'Packets', category: 'Sauces' },
  { label: '+2 Gallons Sweet Tea', name: 'Chick-fil-A® Sweet Tea Gallon', qty: 2, unit: 'Gallons', category: 'Beverages' },
  { label: '+1 Bag CFA Ice', name: '5 lb Bag of Chick-fil-A® Pellet Ice', qty: 1, unit: 'Bag', category: 'Beverages' },
  { label: '+25 Plates & Napkins', name: 'Catering Plates & Napkins Kit', qty: 25, unit: 'Sets', category: 'Paper Goods' }
];
