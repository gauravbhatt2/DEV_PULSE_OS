import httpx
import asyncio

async def run():
    async with httpx.AsyncClient() as client:
        resp = await client.get('https://api.github.com/repos/gauravbhatt2/DEV_PULSE_OS/commits/b23dde38')
        data = resp.json()
        if 'files' not in data:
            print("NO FILES. Keys:", data.keys())
            print("Message:", data.get('message'))
        else:
            for f in data.get('files', []):
                print(f"File: {f.get('filename')} - Has Patch: {'patch' in f}")
            
if __name__ == "__main__":
    asyncio.run(run())
