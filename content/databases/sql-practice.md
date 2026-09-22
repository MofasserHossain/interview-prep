# SQL Practice Problems Interview Guide

Classic SQL interview problems, solved and explained: self joins, ranking per
group, anti-joins, full outer joins, percent of total, month-over-month growth,
running totals and moving averages, gaps and islands, missing dates, medians,
relational division, first purchase per customer, top N per group with joins,
mutual relationships, overlapping ranges, and hierarchy paths.

Use it actively: load the schema, read the task, write your own query, then
compare. Every output was produced by running the solution on PostgreSQL 17
(`psql`, with `\pset null NULL`), and each problem notes where MySQL 8 differs.
The SQL Fundamentals guide covers second-highest salary, duplicates, top N per
group, and pivots; these problems build on it.

## Practice Schema

Load once; every problem uses these tables.

```sql
CREATE TABLE departments (
  id   int PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO departments VALUES
  (1, 'Engineering'), (2, 'Sales'), (3, 'Support'), (4, 'Legal');

CREATE TABLE employees (
  id            int PRIMARY KEY,
  name          text NOT NULL,
  department_id int REFERENCES departments,
  manager_id    int REFERENCES employees,
  salary        int NOT NULL,
  hired_on      date NOT NULL
);
INSERT INTO employees VALUES
  (1,  'Ava',  1,    NULL, 180000, '2019-03-01'),
  (2,  'Ben',  1,    1,    150000, '2020-06-15'),
  (3,  'Cara', 1,    2,    150000, '2021-01-10'),
  (4,  'Dev',  1,    2,    120000, '2022-08-01'),
  (5,  'Eli',  2,    1,    110000, '2020-02-01'),
  (6,  'Fay',  2,    5,    115000, '2021-09-20'),
  (7,  'Gus',  2,    5,     90000, '2023-04-03'),
  (8,  'Hana', 3,    1,     70000, '2022-11-11'),
  (9,  'Ivan', 3,    8,     72000, '2023-01-15'),
  (10, 'Jo',   NULL, 1,     95000, '2024-05-05');

CREATE TABLE customers (
  id         int PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL,
  country    text NOT NULL,
  created_at date NOT NULL
);
INSERT INTO customers VALUES
  (1, 'Alice', 'alice@example.com', 'BD', '2026-01-02'),
  (2, 'Bob',   'bob@example.com',   'US', '2026-01-10'),
  (3, 'Carol', 'carol@example.com', 'BD', '2026-02-01'),
  (4, 'Dan',   'dan@example.com',   'IN', '2026-02-14'),
  (5, 'Eve',   'eve@example.com',   'US', '2026-03-01');

CREATE TABLE products (
  id       int PRIMARY KEY,
  name     text NOT NULL,
  category text NOT NULL,
  price    numeric(10, 2) NOT NULL
);
INSERT INTO products VALUES
  (1, 'Keyboard', 'electronics', 50), (2, 'Mouse',    'electronics', 20),
  (3, 'Monitor',  'electronics', 200), (4, 'Notebook', 'stationery',  5),
  (5, 'Pen',      'stationery',  2);

CREATE TABLE orders (
  id          int PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers,
  status      text NOT NULL,
  ordered_at  date NOT NULL
);
INSERT INTO orders VALUES
  (101, 1, 'delivered', '2026-01-05'), (102, 2, 'delivered', '2026-01-18'),
  (103, 1, 'cancelled', '2026-02-02'), (104, 3, 'delivered', '2026-02-11'),
  (105, 1, 'delivered', '2026-02-20'), (106, 2, 'delivered', '2026-03-03'),
  (107, 3, 'delivered', '2026-03-14'), (108, 1, 'delivered', '2026-03-28');

CREATE TABLE order_items (
  order_id   int REFERENCES orders,
  product_id int REFERENCES products,
  qty        int NOT NULL,
  unit_price numeric(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
INSERT INTO order_items VALUES
  (101, 1, 1, 50), (101, 4, 4, 5),
  (102, 2, 2, 20),
  (103, 3, 1, 200),
  (104, 1, 1, 50), (104, 2, 1, 20),
  (105, 5, 10, 2),
  (106, 3, 1, 180),
  (107, 4, 2, 5), (107, 5, 5, 2),
  (108, 1, 2, 45), (108, 2, 1, 20), (108, 3, 1, 190);

CREATE TABLE logins (
  user_id  int  NOT NULL,
  login_on date NOT NULL,
  PRIMARY KEY (user_id, login_on)
);
INSERT INTO logins VALUES
  (1, '2026-03-01'), (1, '2026-03-02'), (1, '2026-03-03'),
  (1, '2026-03-05'), (1, '2026-03-06'),
  (2, '2026-03-01'), (2, '2026-03-03'),
  (3, '2026-03-02'), (3, '2026-03-03'), (3, '2026-03-04'), (3, '2026-03-05');

CREATE TABLE follows (
  follower_id int NOT NULL,
  followee_id int NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
INSERT INTO follows VALUES (1, 2), (2, 1), (1, 3), (3, 4), (4, 3), (2, 4);

CREATE TABLE bookings (
  id     int PRIMARY KEY,
  room   int NOT NULL,
  starts timestamp NOT NULL,
  ends   timestamp NOT NULL
);
INSERT INTO bookings VALUES
  (1, 101, '2026-03-01 09:00', '2026-03-01 10:00'),
  (2, 101, '2026-03-01 09:30', '2026-03-01 11:00'),
  (3, 101, '2026-03-01 11:00', '2026-03-01 12:00'),
  (4, 102, '2026-03-01 09:00', '2026-03-01 10:00');
```

## 1. Employees Who Earn More Than Their Manager

Task: list each employee paid more than their direct manager, with both salaries.

```sql
SELECT e.name AS employee, e.salary,
       m.name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON m.id = e.manager_id
WHERE e.salary > m.salary
ORDER BY e.name;
```

Output:

```txt
 employee | salary | manager | manager_salary
----------+--------+---------+----------------
 Fay      | 115000 | Eli     |         110000
 Ivan     |  72000 | Hana    |          70000
```

Why it works:

A **self join** puts each employee next to their manager's row. The inner join
drops Ava, who has no manager — correct here, since she cannot out-earn nobody.

Follow-up:

"Show every employee with their manager's name, including those without one" is
the same join as a `LEFT JOIN`, with `NULL` for Ava.

## 2. The Highest-Paid Employee In Each Department

Task: the top earner per department, keeping everyone if two people tie for top.

```sql
SELECT department, name, salary
FROM (
  SELECT d.name AS department,
         e.name,
         e.salary,
         RANK() OVER (PARTITION BY e.department_id
                      ORDER BY e.salary DESC) AS rnk
  FROM employees e
  JOIN departments d ON d.id = e.department_id
) ranked
WHERE rnk = 1
ORDER BY department;
```

Output:

```txt
 department  | name | salary
-------------+------+--------
 Engineering | Ava  | 180000
 Sales       | Fay  | 115000
 Support     | Ivan |  72000
```

Why it works:

`RANK()` gives tied salaries the same rank, so a tie for first returns both
people. `ROW_NUMBER()` would silently pick one.

Alternative without window functions — also valid on MySQL 5.7:

```sql
SELECT d.name AS department, e.name, e.salary
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.salary = (
  SELECT max(salary) FROM employees WHERE department_id = e.department_id
)
ORDER BY department;
```

Output:

```txt
 department  | name | salary
-------------+------+--------
 Engineering | Ava  | 180000
 Sales       | Fay  | 115000
 Support     | Ivan |  72000
```

The correlated subquery runs per row, so the window version usually scales
better.

## 3. The Top Three Salaries In Each Department

Task: everyone earning one of the three highest **distinct** salaries in their
department.

```sql
SELECT department, name, salary
FROM (
  SELECT d.name AS department,
         e.name,
         e.salary,
         DENSE_RANK() OVER (PARTITION BY e.department_id
                            ORDER BY e.salary DESC) AS rnk
  FROM employees e
  JOIN departments d ON d.id = e.department_id
) ranked
WHERE rnk <= 3
ORDER BY department, salary DESC, name;
```

Output:

```txt
 department  | name | salary
-------------+------+--------
 Engineering | Ava  | 180000
 Engineering | Ben  | 150000
 Engineering | Cara | 150000
 Engineering | Dev  | 120000
 Sales       | Fay  | 115000
 Sales       | Eli  | 110000
 Sales       | Gus  |  90000
 Support     | Ivan |  72000
 Support     | Hana |  70000
```

Why it works:

Ben and Cara share the second-highest Engineering salary. `DENSE_RANK` gives them
both rank 2 and still lets Dev in at rank 3 — four people from "the top three
salaries". `RANK` gives Dev rank 4 and drops him; so does `ROW_NUMBER`, which
numbers Ben and Cara 2 and 3 in no guaranteed order.

Interview note:

Ask which one the question means before writing a line: three **people**, three
**salary levels**, or three **positions** with ties allowed. The ranking function
is the answer to that question.

## 4. Departments Without Employees, And Employees Without A Department

Task: both kinds of orphans in one result.

```sql
SELECT d.name AS department, e.name AS employee
FROM departments d
FULL OUTER JOIN employees e ON e.department_id = d.id
WHERE d.id IS NULL OR e.id IS NULL
ORDER BY department, employee;
```

Output:

```txt
 department | employee
------------+----------
 Legal      | NULL
 NULL       | Jo
```

Why it works:

A `FULL OUTER JOIN` keeps unmatched rows from **both** sides, with nulls on the
other side; the `WHERE` keeps only those.

MySQL differs:

MySQL has no `FULL OUTER JOIN`. Combine the two anti-joins:

```sql
SELECT d.name AS department, NULL AS employee
FROM departments d
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.department_id = d.id)
UNION ALL
SELECT NULL, e.name
FROM employees e
WHERE e.department_id IS NULL;
```

Output:

```txt
 department | employee
------------+----------
 Legal      | NULL
 NULL       | Jo
```

## 5. Customers Who Never Placed An Order

Task: customers with no orders at all.

```sql
SELECT c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
ORDER BY c.name;
```

Output:

```txt
 name
------
 Dan
 Eve
```

Why it works:

`NOT EXISTS` is the null-safe anti-join and stops at the first matching order.
The `LEFT JOIN ... WHERE o.id IS NULL` form gives the same result and usually the
same plan.

Interview trap:

`WHERE c.id NOT IN (SELECT customer_id FROM orders)` returns **nothing at all** if
any `customer_id` in `orders` is `NULL`. The column is `NOT NULL` here, but the
habit to build is `NOT EXISTS`.

## 6. Each Category's Share Of Revenue

Task: delivered revenue per category, and each category's percentage of the
total.

```sql
SELECT p.category,
       sum(oi.qty * oi.unit_price) AS revenue,
       round(100 * sum(oi.qty * oi.unit_price)
                 / sum(sum(oi.qty * oi.unit_price)) OVER (), 1) AS pct
FROM order_items oi
JOIN orders o   ON o.id = oi.order_id AND o.status = 'delivered'
JOIN products p ON p.id = oi.product_id
GROUP BY p.category
ORDER BY revenue DESC;
```

Output:

```txt
  category   | revenue | pct
-------------+---------+------
 electronics |  640.00 | 91.4
 stationery  |   60.00 |  8.6
```

Why it works:

`sum(...) OVER ()` is a window over the **grouped** rows — the total of every
category's revenue — so each row can divide by it. The nested
`sum(sum(...))` is legal: the inner `sum` is the `GROUP BY` aggregate, the outer
one the window function, which runs after grouping.

Important:

Revenue comes from `order_items.unit_price`, the price **at the time of sale** —
not `products.price`. Order 106 sold a Monitor for 180 while its list price is
200.

## 7. Monthly Revenue And Month-Over-Month Growth

Task: delivered revenue per month, the previous month's revenue, and the growth
percentage.

```sql
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::date AS month,
         sum(oi.qty * oi.unit_price) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status = 'delivered'
  GROUP BY 1
)
SELECT month,
       revenue,
       lag(revenue) OVER w AS previous,
       round(100 * (revenue - lag(revenue) OVER w)
                 / nullif(lag(revenue) OVER w, 0), 1) AS growth_pct
FROM monthly
WINDOW w AS (ORDER BY month)
ORDER BY month;
```

Output:

```txt
   month    | revenue | previous | growth_pct
------------+---------+----------+------------
 2026-01-01 |  110.00 |     NULL |       NULL
 2026-02-01 |   90.00 |   110.00 |      -18.2
 2026-03-01 |  500.00 |    90.00 |      455.6
```

Why it works:

- `LAG` reads the previous row in the window's order; the first month has none,
  so `previous` and `growth_pct` are `NULL`.
- `nullif(..., 0)` turns a zero previous month into `NULL` instead of a
  division-by-zero error.
- `WINDOW w AS (...)` names the window once instead of repeating it three times.

MySQL differs:

Replace `date_trunc('month', ordered_at)` with
`DATE_FORMAT(ordered_at, '%Y-%m-01')`. The `WINDOW` clause and `LAG` work in
MySQL 8.

Interview trap:

A month with **no** sales produces no row, so `LAG` compares March with January
and calls it month-over-month. Build the months from a calendar
(`generate_series` in PostgreSQL, a recursive CTE in MySQL) and `LEFT JOIN` the
revenue onto it.

## 8. A Running Total And A Moving Average Per Customer

Task: for each delivered order, the customer's cumulative spend so far and the
average of their last two orders.

```sql
WITH order_totals AS (
  SELECT o.id, o.customer_id, o.ordered_at, sum(oi.qty * oi.unit_price) AS total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status = 'delivered'
  GROUP BY o.id
)
SELECT customer_id,
       id AS order_id,
       ordered_at,
       total,
       sum(total) OVER (PARTITION BY customer_id ORDER BY ordered_at)
         AS running_total,
       round(avg(total) OVER (PARTITION BY customer_id ORDER BY ordered_at
                              ROWS BETWEEN 1 PRECEDING AND CURRENT ROW), 2)
         AS avg_last_2
FROM order_totals
ORDER BY customer_id, ordered_at;
```

Output:

```txt
 customer_id | order_id | ordered_at | total  | running_total | avg_last_2
-------------+----------+------------+--------+---------------+------------
           1 |      101 | 2026-01-05 |  70.00 |         70.00 |      70.00
           1 |      105 | 2026-02-20 |  20.00 |         90.00 |      45.00
           1 |      108 | 2026-03-28 | 300.00 |        390.00 |     160.00
           2 |      102 | 2026-01-18 |  40.00 |         40.00 |      40.00
           2 |      106 | 2026-03-03 | 180.00 |        220.00 |     110.00
           3 |      104 | 2026-02-11 |  70.00 |         70.00 |      70.00
           3 |      107 | 2026-03-14 |  20.00 |         90.00 |      45.00
```

Why it works:

`GROUP BY o.id` may select `customer_id` and `ordered_at` because `id` is the
primary key — every other column of `orders` depends on it. Both PostgreSQL and
MySQL 8 accept this.

Interview trap:

With `ORDER BY` and no explicit frame, a window defaults to `RANGE BETWEEN
UNBOUNDED PRECEDING AND CURRENT ROW`, and `RANGE` treats rows with the same
`ordered_at` as **peers** — two orders on one day get the same running total,
already including both. Use `ROWS` framing, or add a unique tie-breaker such as
`id` to the `ORDER BY`, when every row must advance the total.

## 9. Consecutive Login Streaks (Gaps And Islands)

Task: each user's streaks of consecutive login days, with start, end, and
length.

```sql
WITH numbered AS (
  SELECT user_id,
         login_on,
         login_on
           - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_on))::int
           AS streak_key
  FROM logins
)
SELECT user_id,
       min(login_on) AS streak_start,
       max(login_on) AS streak_end,
       count(*)      AS days
FROM numbered
GROUP BY user_id, streak_key
ORDER BY user_id, streak_start;
```

Output:

```txt
 user_id | streak_start | streak_end | days
---------+--------------+------------+------
       1 | 2026-03-01   | 2026-03-03 |    3
       1 | 2026-03-05   | 2026-03-06 |    2
       2 | 2026-03-01   | 2026-03-01 |    1
       2 | 2026-03-03   | 2026-03-03 |    1
       3 | 2026-03-02   | 2026-03-05 |    4
```

Why it works:

Within a run of consecutive days, the date and the row number both go up by one
each row, so `date - row_number` stays **constant**. A gap bumps the date by more
than the row number, which changes the constant. That constant is the island's
identity — group by it.

```txt
login_on    row_number   login_on - row_number
2026-03-01  1            2026-02-28   ┐
2026-03-02  2            2026-02-28   ├ streak 1
2026-03-03  3            2026-02-28   ┘
2026-03-05  4            2026-03-01   ┐ streak 2
2026-03-06  5            2026-03-01   ┘
```

Follow-up:

"Users with a streak of at least three days" is the same query with
`HAVING count(*) >= 3`.

MySQL differs:

Date arithmetic is `DATE_SUB(login_on, INTERVAL ROW_NUMBER() OVER (...) DAY)`.

## 10. Days Missing From A Range

Task: the days between March 1 and March 6 on which user 1 did not log in.

```sql
SELECT day::date AS missing_day
FROM generate_series(date '2026-03-01', date '2026-03-06', interval '1 day')
       AS day
WHERE NOT EXISTS (
  SELECT 1 FROM logins l WHERE l.user_id = 1 AND l.login_on = day::date
)
ORDER BY missing_day;
```

Output:

```txt
 missing_day
-------------
 2026-03-04
```

Why it works:

You cannot select rows that do not exist, so generate the complete calendar and
anti-join the data against it.

MySQL differs:

MySQL has no `generate_series`; generate the days with a recursive CTE:

```sql
-- MySQL 8
WITH RECURSIVE days AS (
  SELECT DATE '2026-03-01' AS day
  UNION ALL
  SELECT day + INTERVAL 1 DAY FROM days WHERE day < '2026-03-06'
)
SELECT day FROM days
WHERE NOT EXISTS (
  SELECT 1 FROM logins l WHERE l.user_id = 1 AND l.login_on = days.day
);
```

## 11. The Median Salary Per Department

Task: the median and the mean salary in each department.

```sql
SELECT d.name AS department,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY e.salary) AS median_salary,
       round(avg(e.salary)) AS mean_salary
FROM employees e
JOIN departments d ON d.id = e.department_id
GROUP BY d.name
ORDER BY d.name;
```

Output:

```txt
 department  | median_salary | mean_salary
-------------+---------------+-------------
 Engineering |        150000 |      150000
 Sales       |        110000 |      105000
 Support     |         71000 |       71000
```

Why it works:

`percentile_cont(0.5)` interpolates between the two middle values when a group
has an even count — Support's median of 71,000 lies between 70,000 and 72,000.
`percentile_disc` returns an actual value from the data instead.

Why it matters:

Sales has a median of 110,000 but a mean of 105,000: one lower salary pulls the
mean down. Medians resist outliers, which is why salary and latency reports use
them.

MySQL differs:

MySQL has no ordered-set aggregates. Number the rows and average the middle one
or two:

```sql
WITH ranked AS (
  SELECT e.department_id, e.salary,
         ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.salary)
           AS rn,
         COUNT(*) OVER (PARTITION BY e.department_id) AS n
  FROM employees e
  WHERE e.department_id IS NOT NULL
)
SELECT department_id, round(avg(salary)) AS median_salary
FROM ranked
WHERE rn IN (FLOOR((n + 1) / 2), FLOOR((n + 2) / 2))
GROUP BY department_id
ORDER BY department_id;
```

Output:

```txt
 department_id | median_salary
---------------+---------------
             1 |        150000
             2 |        110000
             3 |         71000
```

`FLOOR((n + 1) / 2)` and `FLOOR((n + 2) / 2)` are the same row for an odd count
and the two middle rows for an even count. The `FLOOR` matters in MySQL, where `/`
returns a decimal: without it, an even count would match only one middle row.

## 12. Customers Who Bought Every Product In A Category

Task: customers who have bought **every** stationery product, in delivered
orders.

```sql
SELECT c.name
FROM customers c
JOIN orders o       ON o.customer_id = c.id AND o.status = 'delivered'
JOIN order_items oi ON oi.order_id = o.id
JOIN products p     ON p.id = oi.product_id AND p.category = 'stationery'
GROUP BY c.id, c.name
HAVING count(DISTINCT p.id) = (
  SELECT count(*) FROM products WHERE category = 'stationery'
)
ORDER BY c.name;
```

Output:

```txt
 name
-------
 Alice
 Carol
```

Why it works:

This is **relational division**: count the distinct stationery products each
customer bought, and keep customers whose count equals the number of stationery
products that exist. `DISTINCT` matters — without it, buying pens twice would
count as two different products.

Follow-up:

Swap in `'electronics'` and only Alice qualifies: Bob never bought a keyboard,
and Carol never bought a monitor.

## 13. Each Customer's First Order

Task: for every customer who has a delivered order — their first order date, how
many days after signing up it came, and their lifetime order count.

```sql
SELECT c.name,
       c.created_at AS signed_up,
       min(o.ordered_at) AS first_order,
       min(o.ordered_at) - c.created_at AS days_to_first_order,
       count(*) AS orders
FROM customers c
JOIN orders o ON o.customer_id = c.id AND o.status = 'delivered'
GROUP BY c.id, c.name, c.created_at
ORDER BY first_order;
```

Output:

```txt
 name  | signed_up  | first_order | days_to_first_order | orders
-------+------------+-------------+---------------------+--------
 Alice | 2026-01-02 | 2026-01-05  |                   3 |      3
 Bob   | 2026-01-10 | 2026-01-18  |                   8 |      2
 Carol | 2026-02-01 | 2026-02-11  |                  10 |      2
```

Why it works:

`min(ordered_at)` finds the first order without sorting or ranking. Subtracting
two `date` values gives a whole number of days in PostgreSQL.

When you need the whole first **row** — its id, its total — rather than just its
date, use `DISTINCT ON (customer_id) ... ORDER BY customer_id, ordered_at` in
PostgreSQL, or `ROW_NUMBER() ... WHERE rn = 1` anywhere.

MySQL differs:

Use `DATEDIFF(MIN(o.ordered_at), c.created_at)` for the day count.

## 14. The Top Two Products By Revenue In Each Category

Task: delivered revenue per product, then the two best products in each
category, keeping ties.

```sql
WITH product_revenue AS (
  SELECT p.category, p.name, sum(oi.qty * oi.unit_price) AS revenue
  FROM order_items oi
  JOIN orders o   ON o.id = oi.order_id AND o.status = 'delivered'
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.id, p.category, p.name
),
ranked AS (
  SELECT *,
         DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rnk
  FROM product_revenue
)
SELECT category, name, revenue, rnk
FROM ranked
WHERE rnk <= 2
ORDER BY category, rnk, name;
```

Output:

```txt
  category   |   name   | revenue | rnk
-------------+----------+---------+-----
 electronics | Monitor  |  370.00 |   1
 electronics | Keyboard |  190.00 |   2
 stationery  | Notebook |   30.00 |   1
 stationery  | Pen      |   30.00 |   1
```

Why it works:

Aggregate first, rank second: the window runs over one row per product, not one
row per order line. Notebook and Pen both earned 30.00, so `DENSE_RANK` returns
both as rank 1 — the stationery "top two" is a tie. Decide with the interviewer
whether a tie should break by name, show both, or pull in the next product.

Important:

The cancelled order 103 included a Monitor at 200. Filtering on
`status = 'delivered'` in the join keeps it out; forgetting the filter is the
most common wrong answer to revenue questions.

## 15. Mutual Follows

Task: pairs of users who follow each other, each pair listed once.

```sql
SELECT a.follower_id AS user_a, a.followee_id AS user_b
FROM follows a
JOIN follows b
  ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
WHERE a.follower_id < a.followee_id
ORDER BY user_a, user_b;
```

Output:

```txt
 user_a | user_b
--------+--------
      1 |      2
      3 |      4
```

Why it works:

The self join finds the reverse edge for each follow. Without
`a.follower_id < a.followee_id`, every mutual pair would appear twice — as
(1, 2) and as (2, 1).

Follow-up:

"People you may know" — users followed by the people I follow, whom I do not
already follow:

```sql
SELECT DISTINCT f2.followee_id AS suggestion
FROM follows f1
JOIN follows f2 ON f2.follower_id = f1.followee_id
WHERE f1.follower_id = 1
  AND f2.followee_id <> 1
  AND NOT EXISTS (
    SELECT 1 FROM follows x
    WHERE x.follower_id = 1 AND x.followee_id = f2.followee_id
  )
ORDER BY suggestion;
```

Output:

```txt
 suggestion
------------
          4
```

## 16. Overlapping Bookings

Task: pairs of bookings for the same room whose times overlap.

```sql
SELECT a.id AS booking, b.id AS overlaps_with, a.room
FROM bookings a
JOIN bookings b
  ON  b.room = a.room
  AND b.id > a.id
  AND a.starts < b.ends
  AND b.starts < a.ends
ORDER BY booking, overlaps_with;
```

Output:

```txt
 booking | overlaps_with | room
---------+---------------+------
       1 |             2 |  101
```

Why it works:

Two intervals overlap exactly when **each starts before the other ends**. The
strict `<` means booking 3, which starts at 11:00 when booking 2 ends, does not
count as an overlap — back-to-back bookings are fine. `b.id > a.id` reports each
pair once.

Interview note:

Detecting overlaps after the fact is a report. Preventing them is a constraint:
PostgreSQL's exclusion constraint on a range column refuses the second booking
at insert time, without a race — see the PostgreSQL Essentials guide.

## 17. Each Employee's Management Chain

Task: every employee with their depth in the org chart and their full chain from
the top.

```sql
WITH RECURSIVE chain AS (
  SELECT id, name, 0 AS depth, name AS path
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, c.depth + 1, c.path || ' > ' || e.name
  FROM employees e
  JOIN chain c ON e.manager_id = c.id
)
SELECT name, depth, path
FROM chain
ORDER BY path;
```

Output:

```txt
 name | depth |       path
------+-------+-------------------
 Ava  |     0 | Ava
 Ben  |     1 | Ava > Ben
 Cara |     2 | Ava > Ben > Cara
 Dev  |     2 | Ava > Ben > Dev
 Eli  |     1 | Ava > Eli
 Fay  |     2 | Ava > Eli > Fay
 Gus  |     2 | Ava > Eli > Gus
 Hana |     1 | Ava > Hana
 Ivan |     2 | Ava > Hana > Ivan
 Jo   |     1 | Ava > Jo
```

Why it works:

The anchor starts at the root; each recursive step appends one level. Sorting by
the path string prints the tree in depth-first order.

MySQL differs:

A recursive CTE's column types come from the **anchor** member. In MySQL,
`name AS path` fixes the column to the length of the longest root name, and the
longer paths fail with "Data too long for column 'path'". Widen it in the
anchor: `CAST(name AS CHAR(500)) AS path`, and use `CONCAT(c.path, ' > ',
e.name)`.

## 18. How Do You Work Through Any SQL Interview Problem?

A method that turns most problems into one of the patterns above:

1. **Restate the grain.** "One row per customer per month" decides the
   `GROUP BY` before anything else.
2. **Ask about ties and missing data.** Ties choose the ranking function; missing
   data decides between inner and outer joins, and whether you need a calendar.
3. **Build it in CTEs, one step each.** Filter, then aggregate, then rank, then
   select. Each CTE can be run and checked on its own.
4. **Aggregate before joining** when two one-to-many relationships meet — or the
   join multiplies rows and inflates sums.
5. **Name the pattern out loud** — self join, anti-join, gaps and islands,
   relational division, top N per group — so the interviewer hears the approach
   before the syntax.
6. **Check the edges** — empty groups, nulls, division by zero, the first row
   of a window — then mention the index that would make it fast.

| Problem shape | Pattern |
| --- | --- |
| Compare a row with a related row in the same table | self join |
| "Never", "without", "no matching" | `NOT EXISTS` anti-join |
| Best, top N, or latest per group | `RANK` / `DENSE_RANK` / `ROW_NUMBER` in a subquery |
| Share of a total | `sum(...) OVER ()` |
| Change from the previous period | `LAG` |
| Cumulative or rolling values | window frame: `ROWS BETWEEN ...` |
| Consecutive runs | row-number difference — gaps and islands |
| Missing periods | calendar from `generate_series` or a recursive CTE |
| "Every" / "all of" | relational division with `HAVING count(DISTINCT ...)` |
| Hierarchies | recursive CTE |
| Overlaps | `a.start < b.end AND b.start < a.end` |

Strong answer:

> I restate the grain of the output first, because it decides the grouping. Then
> I ask how ties and missing rows should behave, since that chooses between
> `RANK` and `ROW_NUMBER` and between inner and outer joins. I write the query as
> a chain of CTEs — filter, aggregate, rank, select — check each step, and finish
> with the edge cases and the index that would support it.

## Sources Used

- <https://www.postgresql.org/docs/current/tutorial-window.html>
- <https://www.postgresql.org/docs/current/functions-window.html>
- <https://www.postgresql.org/docs/current/functions-aggregate.html>
- <https://www.postgresql.org/docs/current/queries-with.html>
- <https://www.postgresql.org/docs/current/functions-srf.html>
- <https://dev.mysql.com/doc/refman/8.0/en/window-functions.html>
- <https://dev.mysql.com/doc/refman/8.0/en/with.html>
