### Youtube Comments sentiment analyzer
#### GOAL: Chrome plugin that analyzes YT video comment section and give stats about the sentiment of the comments : (Pos percentage, Neg Percentage, Neu Percentage, comment marking ... )



<p align="center">
  <img src="demo.gif" alt="Demo" width="800">
</p>


### Powered by: distillbert-base-uncased finetuned on downstram sentiment classification task
### How to run:
#### Docker image [SIMPLEST]:
PS: First, you need to install Docker into your machine (if not installed earlier).
After cloning the repo into your local machine, execute the following command within the code directory:
```shell
docker compose up --build
```
which will build and run a docker container that will run the backend server.
Then, Obtain the chrome extension "Comment Pulse" from the chrome extension store, and use it to analyze any opened youtube  video.
### Plan
1. Data collection
2. Data preprocessing 
3. Build Baseline ML Model
4. Setup mlflow server for experiment tracking 
5. Enhance the baseline 
6. Build the pipeline with DVC
7. Implement Chrome plugin 
8. CI/CD workflow
9. Dockerization
10. Deployment

### Chrome extension
The frontend is in [`extension/`](extension/). It reads the current YouTube video,
calls the backend's `/analyze` endpoint, and displays a sentiment percentage bar.

Start the API from this project directory:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Then open `chrome://extensions`, enable Developer mode, and load `extension/` as
an unpacked extension. Open a YouTube video, click Comment Pulse, and select
**Analyze comments**. See the [extension setup and tests](extension/README.md)
for prerequisites and configuration.


