import asyncio
from app.services.github_service import get_installation_token, get_commit_detail

async def run():
    try:
        token = await get_installation_token()
        res = await get_commit_detail('gauravbhatt2', 'devpulse-os', 'b23dde383a495e279e0e1a0596333fd6bced9e7e', token)
        if res and 'files' in res:
            for f in res['files']:
                print(f"File: {f.get('filename')} - Patch exists: {'patch' in f} - Patch Length: {len(f.get('patch', '')) if f.get('patch') else 0}")
        else:
            print("Failed to get files from response")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(run())
