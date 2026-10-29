# GitHub proxy on AWS Lambda

1. GitHub > Settings > Developer settings > Fine-grained tokens: create a token with read-only access to public data (no extra permissions).
2. Install the AWS SAM CLI and run `aws configure`.
3. Deploy:
   ```bash
   cd lambda
   sam build
   sam deploy --guided   # enter GitHubToken and AllowedOrigin (use * while testing)
   ```
4. Copy the `ApiUrl` output into `const API=""` in `index.html`, then `git push` so Amplify redeploys.
5. After you know your Amplify URL, redeploy with `AllowedOrigin` set to it.

Results are cached for 10 minutes inside the function, so GitHub is called rarely and the garden still works if GitHub is down.
