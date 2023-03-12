#! /usr/bin/env bash

# chdir to project root
cd "$(dirname "$0")"/../..

test_cases="$@"
if [ -z "$test_cases" ]; then
    test_cases=$(find test/import-antlr4/ -mindepth 1 -maxdepth 1 -type d)
fi

# loop test cases
for dir in $test_cases
do

echo
echo "test case: $dir"
name=$(basename "$dir")

d="$dir/lezer-parser-$name/src"
[ -d "$d" ] || mkdir -p "$d"

parser=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*Parser.g4")
lexer=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*Lexer.g4")
if [ -z "$parser" ]; then
  parser=$(find $dir/antlr4-grammar-$name -maxdepth 1 -type f -name "*.g4")
fi
out="$dir/lezer-parser-$name/src/grammar.lezer"
echo "importing from"
echo "  $parser"
if [ -n "$lexer" ]; then
  echo "  $lexer"
fi
echo "to"
echo "  $out"
echo "node src/import-antlr4 $parser $lexer >$out"
node src/import-antlr4 $parser $lexer >$out

done
