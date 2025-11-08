#!/bin/bash

# Heroku deployment script
# Run this script to create and deploy your Heroku app

APP_NAME="unified-algorand-compiler"

echo "Creating Heroku app..."
heroku create $APP_NAME --stack container

echo "Setting stack to container..."
heroku stack:set container -a $APP_NAME

echo "Deploying to Heroku..."
git push heroku main

echo "Opening app..."
heroku open -a $APP_NAME

echo "Deployment complete!"
echo "App URL: https://$APP_NAME.herokuapp.com"