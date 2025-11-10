# Floxy - A media cache service

Floxy is a media caching proxy service that downloads, caches, and serves audio/video content using ytdlp-nodejs. It provides a web server interface for clients to access cached media, with automatic expiration and deletion of cached files after a specified time.

"
Basically uh
handles downloading music 
pushes it to the webserver
then removes it once it's done playing on the game server.
"

note things
- When files get "deleted" we append a random deleted string so its unknown when we serve it.

# TODO

- [ ] normalize API responses, i am getting tired of deciding between error or message or error AND message for errors n shit
- [ ] figure out a better way to specify quality while also keeping track of what the file extension will be.
- [ ] support tracklists maybe? (albums/playlists/EPs/etc) far into the future.
- [ ] Periodically fix any entries in the database that are marked as pending but not in the current cache.

# Buhbuh

Floxy will not serve files for you, you must have a reverse proxy config setup to hit the API. You are responsible for the webserver that serves the cache

## Caddy Example

Single domain
```nginx
www.example.com {
  handle /api/* {
    reverse_proxy localhost:3050/api/{uri}
  }

  handle_path /media/* {
    root * /opt/floxy/cache
    file_server
  }
}
```

Subdomain
```nginx
api.example.com {
  reverse_proxy localhost:3050
}

cache.example.com {
  root * /opt/floxy/cache
  file_server
}
```


## Nginx Example

Multi domain
```nginx
server {
  listen 80;
  listen [::]:80;
  server_name api.example.com;

  location / {
    proxy_pass http://localhost:3050;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}

server {
  listen 80;
  listen [::]:80;
  server_name cache.example.com;
  location / {
    root /opt/floxy/cache;
    autoindex off;
  }
}
```

Single domain
```nginx
server {
  listen 80;
  listen [::]:80;
  server_name www.example.com;

  location /api/ {
    proxy_pass http://localhost:3050;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /cache/ {
    root /opt/floxy/cache;
    autoindex on;
  }
}
```
