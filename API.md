

# API routes
## Media caching/requesting
`POST /api/media/queue` - Add media to be fetched, to the queue. If media is already cached in some form, will return 409 Conflict
  - query params:
    - url: required, string, link to media to attempt to download.
    - ttl: optional, number (seconds), time this media should be available on the cache for, defaults to config/env setting
    - reencode: optional, string, must be one of the supported profiles, provided at /api
    - extra: optional, JSON string, notes to store about this particular cache. example: ckey info, player info,
`POST /api/ytdlp| /api/ytdlp/:id` - Given a url, will fetch and return the raw JSON from yt-dlp's -J param
  At least of the following is required.
  - Url Params:
    - id: string, media entry ID 
  - query params:
    - url: string, link to media

`GET /api/media/:id` - Get a media cache, returns JSON, includes data about the media, valid means it's still valid on the server, provides path on webserver from root (/) to the audio/media file to serve.will also include metadata about the file if it finds it in the MP3/ogg/medias data or whatever. should return length of audio too in millisecond.

`DELETE /api/media/:id` Invalidates cache, cache file will be retained for 30 days, unavailable for serving.
  - When a request is made to this route, the file is moved to a private cache folder, 
  - query params:
    - hard: optional, boolean, if true, will delete the file immediately instead of marking it as deleted and retaining for 30 days.

`GET /api/media/` - list all media caches, with query params to filter by valid, expired, etc. (has pagination)
  - query params:
    - valid: optional, boolean, filter by valid or expired caches
    - page: optional, number, page number for pagination
    - limit: optional, number, number of items per page

## User authentication.

just copy veyra lols

allow user creation via api, and use JWT tokens for sessions. 

# flow

AUth via 