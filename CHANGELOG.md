<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [5.0.0](https://github.com/rexxars/send-ranges/compare/v4.0.0...v5.0.0) (2023-09-28)

### ⚠ BREAKING CHANGES

- ship with official typescript types
- require node 18 or higher

### Features

- require node 18 or higher ([1cea745](https://github.com/rexxars/send-ranges/commit/1cea7458a7a11e80fadeecd8b4918ee730df7abc))
- ship with official typescript types ([e7a0d75](https://github.com/rexxars/send-ranges/commit/e7a0d7596e9f9daa303b7ca5efa9cc588d476737))

# Change Log

All notable changes will be documented in this file.

## 4.0.0 - 2020-07-16

### BREAKING

- Drop support for Node 8.

## 3.0.0 - 2019-03-23

### BREAKING

- Drop support for Node 6.

## 2.0.0 - 2018-10-05

### BREAKING

- `Vary: Range` is no longer sent on 206 responses. As long as a cache behaves correctly on a 206 response (according to RFC 2616), this should be a safe (and more correct) behavior.
