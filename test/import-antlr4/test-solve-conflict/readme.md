# test/import-antlr4/test-solve-conflict

## grammar.antlr4

https://github.com/antlr/antlr4/blob/master/doc/getting-started.md

antlr4-grammar-test-solve-conflict/Expr.g4

```antlr4
grammar Expr;
prog:	expr EOF ;
expr:	expr ('*'|'/') expr
    |	expr ('+'|'-') expr
    |	INT
    |	'(' expr ')'
    ;
NEWLINE : [\r\n]+ -> skip;
INT     : [0-9]+ ;
```

## grammar.lezer

lezer-parser-test-solve-conflict/src/grammar.lezer

```lezer
@top prog {
  expr
}

expr {
  expr (
    '*' |
    '/'
  ) expr |
  expr (
    '+' |
    '-'
  ) expr |
  INT |
  '(' expr ')'
}

@tokens {

  NEWLINE {
    $[\r\n]+
  }

  INT {
    $[0-9]+
  }
}

@skip {
  NEWLINE
}
```

## build error

lezer-parser-test-solve-conflict/build.sh

lezer-parser-test-solve-conflict/build.err

```
shift/reduce conflict between
  expr -> expr · "*" expr
and
  expr -> expr "*" expr
With input:
  expr "*" expr · "*" …
Shared origin: @top -> · expr
  via expr -> expr "*" · expr
    expr -> expr · "*" expr
```

## expected solution

1. muldiv has higher precedence than addsub
2. muldiv and addsub are left-associative

```diff
diff -u lezer-parser-test-solve-conflict/src/grammar.lezer{,.expected}
@@ -1,13 +1,18 @@
+@precedence {
+  muldiv @left,
+  addsub @left
+}
+
 @top prog {
   expr
 }
 
 expr {
-  expr (
+  expr !muldiv (
     '*' |
     '/'
   ) expr |
-  expr (
+  expr !addsub (
     '+' |
     '-'
   ) expr |
```
