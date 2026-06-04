#!/bin/bash
cd /Users/shileipeng/Documents/mygithub/EnvoyMesh
npm test 2>&1 | tail -40 > test-output.txt
echo "DONE" >> test-output.txt
