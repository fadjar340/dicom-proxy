# dicom-proxy
Proxy for dcm4chee 5.x to dcm4chee 2.x


# Workflow
```markdown
  +-------------------+       +-------------------+       +-------------------+
  |                   |       |                   |       |                   |
  |   OHIF Viewer     | ----> |     Proxy         | ----> |  dcm4chee 2.x     |
  |                   |       |                   |       |                   |
  +-------------------+       +-------------------+       +-------------------+
          |                           |                           |
          | 1. Sends DICOM Requests   | 2. Forwards Requests      | 3. Processes Requests
          | (WADO, QIDO, STOW)        | to dcm4chee 2.x           | and Returns Results
          |                           |                           |
          |                           v                           |
          |                   +-------------------+               |
          |                   |                   |               |
          +-----------------> |  PostgreSQL DB    | <-------------+
                              |                   |
                              +-------------------+
                                      |
                                      | 4. Logs Requests and
                                      |    Stores Configurations
                                      v
```

# Installation

```
git clone https://github.com/fadjar340/dicom-proxy.git
cd dicom-proxy

edit .env
docker compose up --build
```

# Usage
```
http://localhost:3000 (for web apps)
http://localhost:8000 (for DICOM Clients)
```

## OHIF Viewer config
```
{
  "servers": {
    "dicomWeb": [
      {
        "name": "dcm4chee-5.x",
        "wadoUriRoot": "http://localhost:8080/dcm4chee-arc/aets/DCM5/wado",
        "qidoRoot": "http://localhost:8080/dcm4chee-arc/aets/DCM5/rs",
        "stowRoot": "http://localhost:8080/dcm4chee-arc/aets/DCM5/rs",
        "supportsStow": true
      }
    ]
  }
}
```