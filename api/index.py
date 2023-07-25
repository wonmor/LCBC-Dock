from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from typing import List

app = FastAPI()

# CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "https://www.lcbcdock.com", "https://lcbcdock.com"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def fetch_search_results(search_term: str) -> List[str]:
    url = "https://search.rcsb.org/rcsbsearch/v2/query"
    json_data = {
        "query": {
            "type": "terminal",
            "service": "full_text",
            "parameters": {
                "value": search_term,
            },
        },
        "return_type": "entry",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=json_data)
            response.raise_for_status()
            data = response.json()

            print(response.json())

        if "result_set" in data:
            return [result["identifier"] for result in data["result_set"]]
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search/{search_term}")
async def search_proteins(search_term: str):
    try:
        return await fetch_search_results(search_term)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "LCBC Dock Backend is running!"}