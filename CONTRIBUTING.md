# General guidelines for contributing code

You are very welcome to contribute to the project! Pull requests welcome, as well as issues or plain messages.

Respect the below and I will be happy to merge your work and credit you for it.

## Style and structure

- Follow the style and conventions already in place.
- _As always, write clean, easy-to-read code. Prefer being slightly more verbose and semantic than being "efficient" and terse_, if such a choice is necessary. Write as if someone is going to contribute on top of your code base tomorrow without knowing you or your work.

## Tests

- Always include tests for additions or changes.
- Always check that all tests (including your new ones) are passing before making a pull request.

## Error handling

- Make sure to handle errors and do any relevant validation logic. Also always output meaningful, actionable messages/warnings/errors to the user.
- Avoid inlining messages, errors or warnings. Instead place those in the dedicated files for each of the mentioned concerns, and read them from there.

## Documentation

- Document your code as needed.
- Add any inline comments as needed for anything that is not self-evident.
- Update the docs with any user-facing changes, such as new CLI commands or arguments.
