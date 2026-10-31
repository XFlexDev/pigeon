# pigeon

mail at bird speed.

a messenger where every letter is physically carried by a pigeon. messages fly at pigeon speed (~80 km/h) over real distance along a great-circle route. you can watch it crawl across the map. helsinki to tokyo takes about four days.

## run

```
pip install -r requirements.txt
PIGEON_DATA=./data python server/app.py
```

serves the web app + api on 127.0.0.1:8377 (PIGEON_PORT to change).
