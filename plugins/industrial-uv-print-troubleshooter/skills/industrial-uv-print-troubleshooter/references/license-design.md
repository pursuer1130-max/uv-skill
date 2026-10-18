# License Design Notes

This plugin uses an Ed25519 public-key verification skeleton.

What it helps with:

- Detecting unsigned or modified `license/license.json`
- Binding a license to a simple local device ID
- Expiring a license after a chosen date

What it does not guarantee:

- Absolute prevention of copying, patching, or reverse engineering
- Secure protection of proprietary knowledge stored plainly inside the plugin
- Online revocation

For commercial distribution, keep valuable knowledge or diagnosis logic behind an online service and let the local plugin call that service after authentication.
