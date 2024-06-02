const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174']
}));
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
        const blogsCollection = database.collection("blogs");
        const subscribesCollection = database.collection("subscribes");
        const trainersCollection = database.collection("trainers");
        const classesCollection = database.collection("classes");
        const paymentsCollection = database.collection("payments");

        //<---jwt token req--->
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, secret_access_token, { expiresIn: "1h" });
            res.send({ token: token });
        })

        //<---save a user to db--->
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user?.email };
            const isExist = await usersCollection.findOne(query);

            if (isExist) return res.send({ message: "User already exists!" });

            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //<---get all testimonials api--->
        app.get("/testimonials", async (req, res) => {
            const result = await testimonialsCollection.find().toArray();
            res.send(result);
        })

        //<---get all blogs api--->
        app.get("/blogs", async (req, res) => {
            const result = await blogsCollection.find().project({ title: 1, author: 1, postDate: 1, image: 1, description: 1 }).limit(6).toArray();
            res.send(result);
        })

        //<---get a single blog data api--->
        app.get("/blog/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await blogsCollection.findOne(query);
            res.send(result);
        })

        //<---get a user role api--->
        app.get("/user/role/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await usersCollection.findOne(query);
            res.send(result.role);
        })

        //<---save subscribes data in db--->
        app.post("/subscribes", async (req, res) => {
            const subscribeUser = req.body;
            const query = { email: subscribeUser.email };
            const isExists = await subscribesCollection.findOne(query);
            if (isExists) return res.send({ message: 'Already subscribes' });
            const result = await subscribesCollection.insertOne(subscribeUser);
            res.send(result);
        })

        //<---get 3 traines data api--->
        app.get("/teams", async (req, res) => {
            const result = await trainersCollection.find({ status: 'verified' }).project({ name: 1, image: 1, biography: 1, skills: 1, experience: 1 }).limit(3).toArray();
            res.send(result);
        })

        //<---get all trainers data api--->
        app.get("/trainers", async (req, res) => {
            const result = await trainersCollection.find({ status: 'verified' }).toArray();
            res.send(result);
        })

        //<---get a single trainer data api--->
        app.get("/trainer-details/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await trainersCollection.findOne(query);
            res.send(result);
        })

        //<---get top booked featured classes api--->
        app.get("/featured-classes", async (req, res) => {
            const result = await classesCollection.aggregate(
                [{ $sort: { totalBooking: -1 } }]
            ).limit(6).toArray();

            res.send(result);
        })
        //<---get all classes data with the trainer data api--->
        app.get("/classes", async (req, res) => {

            const page = parseInt(req.query.page);

            const totalclass = await classesCollection.countDocuments();

            const result = await classesCollection.aggregate([
                {
                    $lookup: {
                        from: "trainers",
                        let: { skill: "$name" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ["$$skill", "$skills"] }
                                }
                            },
                            {
                                $project: {
                                    _id: 1,
                                    image: 1
                                }
                            }
                        ],
                        as: "matchedTrainers"
                    }
                },
                {
                    $match: {
                        matchedTrainers: { $ne: [] }
                    }
                }
            ]).skip(page * 6).limit(6).toArray();

            res.send({ result, totalclass });
        })

        //<---post api for save the payment and increase the class total booking--->
        app.post("/payment", async (req, res) => {
            const paymentData = req.body;
            const name = paymentData.class.name;
            const trainerName = paymentData.trainer.name;

            // const query1 = { 'class.name': { $regex: name, $options: 'i' } };
            // const query0 = { 'trainer.name': { $regex: trainerName, $options: 'i' } };
            const query2 = { name: { $regex: name, $options: 'i' } };

            const result = await paymentsCollection.insertOne(paymentData);
            await classesCollection.updateOne(query2, { $inc: { totalBooking: 1 } });
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