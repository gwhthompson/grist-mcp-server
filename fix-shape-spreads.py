#!/usr/bin/env python3
"""
Fix all ...PaginationSchema.shape spreads by replacing with .merge(PaginationSchema)
"""

import re

files_to_fix = [
    'src/tools/discovery.ts',
    'src/tools/reading.ts',
    'src/schemas/common.ts'
]

for filepath in files_to_fix:
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace pattern: ...PaginationSchema.shape\n  })\n  .strict()
    # With: })\n  .merge(PaginationSchema)\n  .strict()

    # Pattern 1: With trailing comma before ...PaginationSchema.shape
    pattern1 = r'(    [a-zA-Z_]+: [^,\n]+,)\n    \.\.\.PaginationSchema\.shape\n  \}\)\n  \.strict\(\)'
    replacement1 = r'\1\n  })\n  .merge(PaginationSchema)\n  .strict()'

    content = re.sub(pattern1, replacement1, content)

    # Pattern 2: Without trailing comma (response_format is last)
    pattern2 = r'(    response_format: ResponseFormatSchema),\n    \.\.\.PaginationSchema\.shape\n  \}\)\n  \.strict\(\)'
    replacement2 = r'\1\n  })\n  .merge(PaginationSchema)\n  .strict()'

    content = re.sub(pattern2, replacement2, content)

    # Pattern 3: In common.ts might be different
    pattern3 = r'(  [a-zA-Z_]+: [^,\n]+,)\n  \.\.\.PaginationSchema\.shape\n\}\)\n\.strict\(\)'
    replacement3 = r'\1\n})\n.merge(PaginationSchema)\n.strict()'

    content = re.sub(pattern3, replacement3, content)

    with open(filepath, 'w') as f:
        f.write(content)

    print(f"✓ Fixed {filepath}")

print("\nDone! All files fixed.")
