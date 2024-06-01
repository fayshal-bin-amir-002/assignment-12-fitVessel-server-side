const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const secret_access_token = process.env.SECRET_ACCESS_TOKEN;

const uri = `mongodb+srv://${user}:${pass}@cluster0.0hiczfr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const database = client.db("fitVesselDB");
        const usersCollection = database.collection("users");
        const testimonialsCollection = database.collection("testimonials");

        //<---jwt token req--->
        app.post("/jwt", async(req, res) => {
            const user = req.body;
            const token = jwt.sign(user, secret_access_token, {expiresIn: "1h"});
            res.send({token: token});
        })

        //<---save a user to db--->
        app.post("/users", async (req,res) => {
            const user = req.body;
            const query = { email: user?.email };
            const isExist = await usersCollection.findOne(query);

            if(isExist) return res.send({message: "User already exists!"});

            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //<---get all testimonials api--->
        app.get("/testimonials", async(req, res) => {
            const result = await testimonialsCollection.find().toArray();
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('FitVessel is running')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})