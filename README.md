# EPG Merger

Combines five public XMLTV EPG sources into one `combined.xml.gz` file and refreshes it every 6 hours via GitHub Actions.

This is a proof of concept for personal use only. Do not redistribute the URL to clients. The upstream sources publish under personal-use terms.

## Sources merged

| Region              | Source                                      |
|---------------------|---------------------------------------------|
| Australia Newcastle | xmltv.net                                   |
| United States       | acidjesuz/EPGTalk US                        |
| United Kingdom      | acidjesuz/EPGTalk UK                        |
| US/UK/Canada/Mexico | acidjesuz/EPGTalk Combined                  |
| Australia (Foxtel)  | i.mjh.nz Foxtel                             |

Channels and programmes are deduped by ID and start time, so the redundancy across EPGTalk US, UK and Combined does not bloat the output.

## One-off setup

1. Create a new **public** GitHub repo. Public matters because GitHub Actions minutes are free and unlimited for public repos. Call it whatever you like, e.g. `epg-merger`.
2. Drop these three files into the repo at these paths:
   ```
   merge.py
   .github/workflows/build-epg.yml
   README.md
   ```
3. Commit and push.
4. Go to the repo's **Actions** tab and click **Enable** if prompted.
5. Click **Build EPG** in the left sidebar, then **Run workflow** in the top right. This kicks off the first build immediately rather than waiting for the next 6-hour slot.
6. When the run finishes (2-4 minutes), `combined.xml.gz` will appear in the repo.

## Your EPG URL

```
https://raw.githubusercontent.com/<your-username>/<repo-name>/main/combined.xml.gz
```

Paste that one URL into your IPTV player's EPG field. Done.

## Refresh schedule

- Every 6 hours via cron.
- Manual: Actions tab > Build EPG > Run workflow.

## Editing the source list

Open `merge.py` and edit the `SOURCES` list at the top. Format is `(name, url, is_gzipped)`. Push the change. Next scheduled run will pick it up.

## Troubleshooting

- **Action run shows a red X**: open the failed run, click into the step that broke. Usually one of the upstream sources was briefly down. The script keeps going even if a source fails, so the build only fails if every single source dies.
- **File is too big**: GitHub caps single files at 100 MB. Current output should sit between 40 and 70 MB gzipped. If it ever creeps over, trim the source list or split by region.
- **Player can't read .gz**: most modern IPTV apps handle gzip. If yours doesn't, change the output in `merge.py` to write plain XML, but watch the file size.

## Licensing reality check

This repo pulls free, community-maintained EPG data. The maintainers ask for personal use. Do not:

- Hand the URL to clients or other people you charge money
- Embed the URL in commercial IPTV products
- Hammer the sources with sub-hourly refreshes

If you want a commercial EPG, contact IceTV in Australia or a similar licensed provider.
