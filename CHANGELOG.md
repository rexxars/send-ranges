# Change Log

All notable changes will be documented in this file.

## 4.0.0 - 2020-07-16

### BREAKING

* Drop support for Node 8.

## 3.0.0 - 2019-03-23

### BREAKING

* Drop support for Node 6.


## 2.0.0 - 2018-10-05

### BREAKING

* `Vary: Range` is no longer sent on 206 responses. As long as a cache behaves correctly on a 206 response (according to RFC 2616), this should be a safe (and more correct) behavior.
