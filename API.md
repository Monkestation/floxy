

# API routes
## Media caching/requesting
`POST /api/media/queue` - Add media to be fetched, to the queue. If media is already cached in some form, will return 409 Conflict
  - query params:
    - url: required, string, HTTP or HTTPS link to media. Invalid URLs return 400. YouTube video links with playlist context queue only the video; playlist URLs are rejected.
    - ttl: optional, number (seconds), time this media should be available on the cache for, defaults to config/env setting
    - profile: optional, string, must be one of the supported profiles, provided at /api
		- bitrate: optional, number, profile is required if this is specified. 
		- dontCleanTitle: optional boolean, defaults to false. Set true to skip title cleaning.
    - extra: optional, JSON string, notes to store about this particular cache. example: ckey info, player info,
`GET /api/ytdlp` or `GET /api/ytdlp/:id` - Fetch normalized metadata for a URL or cached entry.
  At least of the following is required.
  - Url Params:
    - id: string, media entry ID 
  - query params:
    - url: string, HTTP or HTTPS link to media
    - dontCleanTitle: optional boolean, defaults to false. `false` enables title cleaning; `true` skips it. Other values return 400.
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

`GET /api/media` - List media caches, including deleted entries. `entries` contains the requested page; `total` counts all database entries.
  - query params:
    - page: optional, number, page number for pagination
    - limit: optional, number, number of items per page

Audio profiles convert to their requested codec and bitrate (bits per second); FLAC is lossless. The default is MP3. The `ogg-opus` profile writes `.opus` files. Completed entries store the actual output extension, which is also used in cache endpoints.

## User authentication.

just copy veyra lols

allow user creation via api, and use JWT tokens for sessions. 

# flow

AUth via 