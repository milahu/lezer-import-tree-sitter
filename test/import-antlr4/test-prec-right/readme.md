# test-prec-right

## conflict

```
shift/reduce conflict between
  expr -> expr · "?" expr ":" expr
and
  expr -> expr "=" expr
With input:
  expr "=" expr · "?" …
Shared origin: @top -> · expr
  via expr -> expr "=" · expr
    expr -> expr · "?" expr ":" expr
```

```js
{
  tokens: [ 'expr', '·', '"?"', 'expr', '":"', 'expr' ],
  inputTokens: [ 'expr', '"="', 'expr', '·', '"?"', '…' ],
  leftOverlap: 1,
  rightOverlap: 1
}
```

problem: fails to find solution 1 in input

```
         expr · "?" expr ":" expr    # solution 1: shift
expr "=" expr · "?" …                # input
expr "=" expr                        # solution 2: reduce
```

how to find solution 1 in input?

skip 1 tokens: fail

the right-most token is always skipped,
because the right-most input token is always the wildcard token "…"

```
                    skip
                    vvvv
expr · "?" expr ":" expr
expr "=" expr · "?" …
                    ^
                    align
```

skip 2 tokens: fail

```
                    skip
                    vvv vvvv
    expr · "?" expr ":" expr
expr "=" expr · "?" …
                    ^
                    align
```

skip 3 tokens: success

```
                    skip
                    vvvv vvv vvvv
         expr · "?" expr ":" expr
expr "=" expr · "?" …
                    ^
                    align
```
