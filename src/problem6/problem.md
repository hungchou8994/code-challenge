# Problem

## Task

Write the specification for a software module on the API service (backend application server).

### Requirements

1. Create documentation for this module in a `README.md` file.
2. Create a diagram to illustrate the flow of execution.
3. Add additional comments for improvements you may have in the documentation.
4. Your specification will be given to a backend engineering team to implement.

---

## Software Requirements

1. We have a website with a scoreboard, which shows the top 10 users' scores.
2. We want live updates of the scoreboard.
3. A user can perform an action (the specific action is not important), and completing this action will increase the user’s score.
4. Upon completion, the action will dispatch an API call to the application server to update the score.
5. We want to prevent malicious users from increasing scores without authorization.