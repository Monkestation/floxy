

# API routes
## Media caching/requesting
`POST /api/media/queue` - Add media to be fetched, to the queue. If media is already cached in some form, will return 409 Conflict
  - query params:
    - url: required, string, link to media to attempt to download.
    - ttl: optional, number (seconds), time this media should be available on the cache for, defaults to config/env setting
    - profile: optional, string, must be one of the supported profiles, provided at /api
		- bitrate: optional, number, profile is required if this is specified. 
		- dontcleantitle: optional, boolean, whether or not to clean metadata tiles of garbage (typically youll want this if you're downloading music)
    - extra: optional, JSON string, notes to store about this particular cache. example: ckey info, player info,
`POST /api/ytdlp |/api/ytdlp/:id` - Given a url, will fetch and return the raw JSON from yt-dlp's -J param
  At least of the following is required.
  - Url Params:
    - id: string, media entry ID 
  - query params:
    - url: string, link to media
Example output for single:
```json
{
	"title": "Traumatic Glitch",
	"artist": "Flleeppyy",
	"album": "Monkestation Lobby Jams Vol. 1",
	"albumArtist": [
		"Flleeppyy",
		"Chronoquest",
		"T87-Sulfurhead",
		"AMPMATIC"
	],
	"year": 2025,
	"genre": [
		"electronic",
		"California"
	],
	"duration": 200.555,
	"url": "https://flleeppyy.bandcamp.com/track/traumatic-glitch"
}
```

Example output for album/playlist
```json
[
	{
		"title": "Artificial",
		"artist": "Flleeppyy",
		"album": "Artificial Flavoring",
		"albumArtist": [
			"Flleeppyy"
		],
		"year": 2024,
		"genre": [
			"electronic",
			"California"
		],
		"duration": 274.909,
		"url": "https://flleeppyy.bandcamp.com/track/artificial-2"
	},
	{
		"title": "Flavoring",
		"artist": "Flleeppyy",
		"album": "Artificial Flavoring",
		"albumArtist": [
			"Flleeppyy"
		],
		"year": 2024,
		"genre": [
			"electronic",
			"California"
		],
		"duration": 255.469,
		"url": "https://flleeppyy.bandcamp.com/track/flavoring"
	}
]
```

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