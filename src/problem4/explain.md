# Sum from 1 to n in TypeScript

This document describes 3 different approaches to calculate the sum of integers from `1` to `n`.

## 1. Iterative approach

```ts
function sum_to_n_a(n: number): number {
    if (n <= 0) return 0;

    let sum = 0;
    for (let i = 1; i <= n; i++) {
        sum += i;
    }
    return sum;
}
```

### Idea

Use a `for` loop to add each number from `1` to `n`.

### Complexity

* Time: `O(n)`
* Space: `O(1)`

### Notes

* Easy to understand
* Safe for large `n`
* Common practical solution

---

## 2. Mathematical formula

```ts
function sum_to_n_b(n: number): number {
    if (n <= 0) return 0;

    return (n * (n + 1)) / 2;
}
```

### Idea

Use the arithmetic series formula:

```ts
1 + 2 + ... + n = n * (n + 1) / 2
```

### Complexity

* Time: `O(1)`
* Space: `O(1)`

### Notes

* Fastest approach
* Best when only the result is needed
* Very efficient for large `n`

---

## 3. Recursive approach

```ts
function sum_to_n_c(n: number): number {
    if (n <= 1) return n;

    return n + sum_to_n_c(n - 1);
}
```

### Idea

Break the problem into smaller subproblems:

```ts
sum(n) = n + sum(n - 1)
```

Base case:

```ts
sum(1) = 1
sum(0) = 0
```

### Complexity

* Time: `O(n)`
* Space: `O(n)`

### Notes

* Good for demonstrating recursion
* Clean and elegant
* Not ideal for very large `n` because it can cause stack overflow

