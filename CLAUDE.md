# Long-running work

- Run any command that may take more than a couple of minutes (sorting or copying many files, big scans, builds, servers) with the Bash tool's `run_in_background: true`. Never detach it yourself with `nohup`, `&`, `disown`, `setsid` or `screen`: Yoda's Studio reads background work from the transcript, and a detached job looks finished while it is still running.
- Have such a job write its detailed output to a file and print only a short summary at the end, so the completion notice stays small.
