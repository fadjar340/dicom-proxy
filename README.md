# dicom-proxy
Proxy for dcm4chee 5.x to dcm4chee 2.x


# Workflow
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