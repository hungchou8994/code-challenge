function sum_to_n_a(n: number): number {
    if(n <= 0) {
        return 0;
    }

    let sum = 0;
    for(let i = 0; i <=n; i++){
        sum += i;
    }
    return sum;
}

function sum_to_n_b(n: number): number {
    if(n <= 0) {
        return 0;
    }
    return n * (n + 1) / 2;
}

function sum_to_n_c(n: number): number {
    if (n <= 1) return n;
    return n + sum_to_n_c(n - 1);
}

function run_sum_to_n(n: number): void {
    console.log("Input:", n);
    console.log("Sum to n (iterative):", sum_to_n_a(n));
    console.log("Sum to n (formula):", sum_to_n_b(n));
    console.log("Sum to n (recursive):", sum_to_n_c(n));
}

run_sum_to_n(5);