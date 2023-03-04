#! /usr/bin/env bash

# chdir to project root
cd "$(dirname "$0")"/..

# get absolute paths
import_js="$(readlink -f dist/import-cli.js)"
import_scanner_js="$(readlink -f src/import-scanner.js)"

test_cases="$@"
if [ -z "$test_cases" ]; then
    test_cases=$(find test/cases/ -mindepth 1 -maxdepth 1 -type d)
fi

# loop test cases
for dir in $test_cases
do

echo
echo "test case: $dir"
name=$(basename "$dir")

d="$dir/lezer-parser-$name/src"
[ -d "$d" ] || mkdir -p "$d"

a="$dir/tree-sitter-$name/src/grammar.json"
b="$dir/lezer-parser-$name/src/grammar.lezer"
echo "importing $a to $b"
node "$import_js" "$a" >"$b"

for c in "$dir/tree-sitter-$name/src"/scanner.[cC]*
do
d="$dir/lezer-parser-$name/src/scanner.js"
echo "importing $c to $d"
node "$import_scanner_js" "$c" "$a" >"$d"
done

done
